import { useEffect, useRef, useCallback } from 'react'
import { TransformSystem } from '@/canvas/TransformSystem'
import { InputHandler } from '@/canvas/InputHandler'
import { UndoRedoStack } from '@/canvas/UndoRedo'
import { renderActiveStroke, redrawCommittedLayer } from '@/canvas/StrokeEngine'
import { renderBackground } from '@/canvas/BackgroundRenderer'
import { EraserSystem } from '@/canvas/EraserSystem'
import { useToolStore } from '@/store/toolStore'
import { useCanvasStore } from '@/store/canvasStore'
import { computeBBox, type Point, type Stroke } from '@/types/stroke'

export function useCanvas() {
  const bgCanvasRef = useRef<HTMLCanvasElement>(null)
  const committedCanvasRef = useRef<HTMLCanvasElement>(null)
  const activeCanvasRef = useRef<HTMLCanvasElement>(null)
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null)

  const transformRef = useRef(new TransformSystem())
  const eraserRef = useRef(new EraserSystem())
  const undoRedoRef = useRef<UndoRedoStack>(new UndoRedoStack([], () => updateUndoRedoState()))
  
  const currentPointsRef = useRef<Point[]>([])
  const inputHandlerRef = useRef<InputHandler | null>(null)
  const renderPendingRef = useRef(false)
  const lastTimeRef = useRef(performance.now())
  const lastTransformStateRef = useRef({ zoom: 0, panX: 0, panY: 0 })

  const { activeTool, penColor, penWidth, eraserRadius, background, darkMode, hydrate } = useToolStore()
  const { setTransform, setPageHeight, setUndoRedo, pageWidth, pageHeight } = useCanvasStore()

  const updateUndoRedoState = useCallback(() => {
    setUndoRedo(undoRedoRef.current.canUndo(), undoRedoRef.current.canRedo())
  }, [setUndoRedo])

  const renderBackgroundLayer = useCallback(() => {
    const canvas = bgCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    renderBackground({
      ctx,
      transform: transformRef.current,
      background,
      darkMode,
      pageWidth,
      pageHeight,
      devicePixelRatio: window.devicePixelRatio
    })
  }, [background, darkMode, pageWidth, pageHeight])

  const renderCommittedLayer = useCallback(() => {
    const canvas = committedCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    redrawCommittedLayer(
      ctx,
      undoRedoRef.current.getStrokes(),
      transformRef.current,
      (id) => eraserRef.current.getOpacity(id)
    )
  }, [])

  const renderActiveLayer = useCallback(() => {
    const canvas = activeCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (currentPointsRef.current.length < 1) return

    renderActiveStroke(
      ctx,
      currentPointsRef.current,
      penColor,
      penWidth,
      transformRef.current,
      activeTool === 'finger'
    )
  }, [penColor, penWidth, activeTool])

  const renderCursorLayer = useCallback(() => {
    const canvas = cursorCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    const { x, y } = eraserRef.current.lastScreenPos
    if (x < -50 || y < -50) return

    const zoom = transformRef.current.zoom
    if (activeTool === 'eraser') {
      const radius = eraserRadius * zoom
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fillStyle = darkMode ? '#333333' : '#ffffff'
      ctx.fill()
      ctx.strokeStyle = darkMode ? '#ffffff' : '#333333'
      ctx.lineWidth = 1.5
      ctx.stroke()
    } else {
      const radius = (penWidth * zoom) / 2
      ctx.beginPath()
      ctx.arc(x, y, Math.max(radius, 2), 0, Math.PI * 2)
      ctx.fillStyle = penColor + '99'
      ctx.fill()
    }
  }, [activeTool, penWidth, penColor, eraserRadius, darkMode])

  const renderLoop = useCallback((time: number) => {
    renderPendingRef.current = false
    const dt = time - lastTimeRef.current
    lastTimeRef.current = time

    const isEraserAnimating = eraserRef.current.tick(dt)
    
    // Check if transform changed (e.g. from scroll/zoom)
    const t = transformRef.current
    const transformChanged = t.zoom !== lastTransformStateRef.current.zoom || 
                             t.panX !== lastTransformStateRef.current.panX || 
                             t.panY !== lastTransformStateRef.current.panY
    
    if (transformChanged) {
       lastTransformStateRef.current = { zoom: t.zoom, panX: t.panX, panY: t.panY }
       setTransform(t.zoom, t.panX, t.panY)
       renderBackgroundLayer()
       renderCommittedLayer()
    } else if (isEraserAnimating) {
       renderCommittedLayer()
    }

    const deletedIds = eraserRef.current.getDeletedAndClear()
    if (deletedIds.length > 0) {
      const strokesToRemove = undoRedoRef.current.getStrokes().filter(s => deletedIds.includes(s.id))
      if (strokesToRemove.length > 0) {
        undoRedoRef.current.push({ type: 'ERASE_STROKES', strokes: strokesToRemove })
        renderCommittedLayer()
      }
    }

    renderActiveLayer()
    renderCursorLayer()

    if (isEraserAnimating || transformChanged) {
      requestAnimationFrame(renderLoop)
      renderPendingRef.current = true
    }
  }, [renderActiveLayer, renderCommittedLayer, renderCursorLayer, renderBackgroundLayer, setTransform])

  const scheduleRender = useCallback(() => {
    if (renderPendingRef.current) return
    renderPendingRef.current = true
    requestAnimationFrame(renderLoop)
  }, [renderLoop])

  const fitPage = useCallback(() => {
    transformRef.current.initFitPage(window.innerWidth, window.innerHeight, pageWidth)
    // Force a render cycle to sync everything
    scheduleRender()
  }, [pageWidth, scheduleRender])

  // Hydrate & Mount
  useEffect(() => {
    hydrate()
  }, [hydrate])

  useEffect(() => {
    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1
      const vw = window.innerWidth
      const vh = window.innerHeight
      
      const refs = [bgCanvasRef, committedCanvasRef, activeCanvasRef, cursorCanvasRef]
      refs.forEach(ref => {
        if (ref.current) {
          ref.current.width = vw * dpr
          ref.current.height = vh * dpr
          const ctx = ref.current.getContext('2d')
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            ctx.imageSmoothingEnabled = true
          }
        }
      })
      fitPage()
    }

    window.addEventListener('resize', handleResize)
    handleResize()
    return () => window.removeEventListener('resize', handleResize)
  }, [fitPage])

  // Input Handling
  useEffect(() => {
    const canvas = activeCanvasRef.current
    if (!canvas) return
    
    const handler = new InputHandler({
      canvas,
      transform: transformRef.current,
      getActiveTool: () => useToolStore.getState().activeTool,
      onStrokeStart: () => {
        currentPointsRef.current = []
        scheduleRender()
      },
      onStrokeMove: (points) => {
        currentPointsRef.current = [...currentPointsRef.current, ...points]
        const last = points[points.length-1]
        const { x: sx, y: sy } = transformRef.current.worldToScreen(last.x, last.y)
        eraserRef.current.lastScreenPos = { x: sx, y: sy }
        scheduleRender()
      },
      onStrokeEnd: () => {
        if (currentPointsRef.current.length > 1) {
          const stroke: Stroke = {
            id: crypto.randomUUID(),
            tool: useToolStore.getState().activeTool,
            color: penColor,
            width: penWidth,
            points: [...currentPointsRef.current],
            bbox: computeBBox(currentPointsRef.current),
            createdAt: Date.now(),
            simulatePressure: useToolStore.getState().activeTool === 'finger'
          }
          undoRedoRef.current.push({ type: 'ADD_STROKE', stroke })
          if (stroke.bbox.maxY > pageHeight / 2) setPageHeight(pageHeight + 1122)
        }
        currentPointsRef.current = []
        scheduleRender()
      },
      onEraserMove: (worldX, worldY, screenX, screenY) => {
        eraserRef.current.lastScreenPos = { x: screenX, y: screenY }
        eraserRef.current.checkHits(worldX, worldY, eraserRadius, undoRedoRef.current.getStrokes())
        scheduleRender()
      },
      onEraserEnd: () => {
        eraserRef.current.commitErase()
        scheduleRender()
      },
      onScroll: (dsy) => {
        transformRef.current.applyScrollY(dsy)
        scheduleRender()
      },
      onZoom: (newZoom, midX, midY) => {
        transformRef.current.setZoomToward(newZoom, midX, midY)
        scheduleRender()
      },
      onPan: (dx, dy) => {
        transformRef.current.applyPan(dx, dy)
        scheduleRender()
      },
      onRenderRequest: scheduleRender
    })

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      eraserRef.current.lastScreenPos = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      scheduleRender()
    }
    const onLeave = () => {
      eraserRef.current.lastScreenPos = { x: -100, y: -100 }
      scheduleRender()
    }

    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerleave', onLeave)
    return () => {
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onLeave)
    }
  }, [penColor, penWidth, eraserRadius, pageHeight, setPageHeight, scheduleRender])

  // Sync background/dark mode/pageHeight changes
  useEffect(() => {
    scheduleRender()
  }, [background, darkMode, pageHeight, scheduleRender])

  return {
    bgCanvasRef, committedCanvasRef, activeCanvasRef, cursorCanvasRef,
    undo: () => { undoRedoRef.current.undo(); scheduleRender(); },
    redo: () => { undoRedoRef.current.redo(); scheduleRender(); },
    fitPage
  }
}
