import { useEffect, useRef, useCallback } from 'react'
import { TransformSystem } from '@/canvas/TransformSystem'
import { InputHandler } from '@/canvas/InputHandler'
import { UndoRedoStack } from '@/canvas/UndoRedo'
import { renderActiveStroke, redrawCommittedLayer } from '@/canvas/StrokeEngine'
import { renderBackground } from '@/canvas/BackgroundRenderer'
import { EraserSystem } from '@/canvas/EraserSystem'
import { useToolStore, invertStrokes } from '@/store/toolStore'
import { useCanvasStore } from '@/store/canvasStore'
import { computeBBox, type Point, type Stroke } from '@/types/stroke'

const PAGE_WIDTH_WORLD = 795
const A4_HEIGHT_WORLD = 1122

export function useCanvas() {
  // Layer Stack Refs
  const bgCanvasRef = useRef<HTMLCanvasElement>(null)
  const committedCanvasRef = useRef<HTMLCanvasElement>(null)
  const activeCanvasRef = useRef<HTMLCanvasElement>(null)
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null)

  // Logic Refs
  const transformRef = useRef(new TransformSystem())
  const eraserRef = useRef(new EraserSystem())
  const undoRedoRef = useRef<UndoRedoStack>(new UndoRedoStack([], (strokes) => {
    updateUndoRedoState()
    renderCommittedLayer()
  }))
  
  const currentPointsRef = useRef<Point[]>([])
  const renderPendingRef = useRef(false)
  const lastTimeRef = useRef(performance.now())

  // Store access
  const { 
    activeTool, inputMode, penColor, penWidth, eraserRadius, 
    background, darkMode, hydrate, setDarkMode 
  } = useToolStore()
  const { setTransform, setPageHeight, setUndoRedo, pageHeight } = useCanvasStore()

  // 1. Core Rendering Methods
  const renderBackgroundLayer = useCallback(() => {
    const canvas = bgCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    renderBackground({
      ctx,
      transform: transformRef.current,
      background,
      darkMode,
      pageWidth: PAGE_WIDTH_WORLD,
      pageHeight,
      devicePixelRatio: window.devicePixelRatio
    })
  }, [background, darkMode, pageHeight])

  const renderCommittedLayer = useCallback(() => {
    const canvas = committedCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    redrawCommittedLayer(
      ctx,
      undoRedoRef.current.getStrokes(),
      transformRef.current,
      (id) => eraserRef.current.getOpacity(id)
    )
  }, [])

  const renderActiveLayer = useCallback(() => {
    const canvas = activeCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
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
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const { x, y } = eraserRef.current.lastScreenPos
    if (x < -100 || y < -100) return

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
      ctx.fillStyle = penColor + '99' // 60% opacity
      ctx.fill()
    }
  }, [activeTool, penWidth, penColor, eraserRadius, darkMode])

  // 2. Lifecycle & Loop
  const renderLoop = useCallback((time: number) => {
    renderPendingRef.current = false
    const dt = time - lastTimeRef.current
    lastTimeRef.current = time

    const isEraserAnimating = eraserRef.current.tick(dt)
    const deletedIds = eraserRef.current.getDeletedAndClear()
    
    if (deletedIds.length > 0) {
      const currentStrokes = undoRedoRef.current.getStrokes()
      const strokesToRemove = currentStrokes.filter(s => deletedIds.includes(s.id))
      if (strokesToRemove.length > 0) {
        undoRedoRef.current.push({ type: 'ERASE_STROKES', strokes: strokesToRemove })
      }
    }

    if (isEraserAnimating) {
      renderCommittedLayer()
    }

    renderActiveLayer()
    renderCursorLayer()

    if (isEraserAnimating) {
      renderPendingRef.current = true
      requestAnimationFrame(renderLoop)
    }
  }, [renderActiveLayer, renderCommittedLayer, renderCursorLayer])

  const scheduleRender = useCallback(() => {
    if (renderPendingRef.current) return
    renderPendingRef.current = true
    requestAnimationFrame(renderLoop)
  }, [renderLoop])

  const updateUndoRedoState = useCallback(() => {
    setUndoRedo(undoRedoRef.current.canUndo(), undoRedoRef.current.canRedo())
  }, [setUndoRedo])

  const initializeCanvasView = useCallback(() => {
    const dpr = window.devicePixelRatio || 1
    const cssWidth = window.innerWidth
    const cssHeight = window.innerHeight

    const canvases = [bgCanvasRef, committedCanvasRef, activeCanvasRef, cursorCanvasRef]
    canvases.forEach(ref => {
      const canvas = ref.current
      if (!canvas) return
      canvas.width = cssWidth * dpr
      canvas.height = cssHeight * dpr
      canvas.style.width = cssWidth + 'px'
      canvas.style.height = cssHeight + 'px'
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.scale(dpr, dpr)
        ctx.imageSmoothingEnabled = true
      }
    })

    // Definitive Initialization Logic
    const horizontalPadding = 80
    const fitZoom = (cssWidth - horizontalPadding) / PAGE_WIDTH_WORLD
    transformRef.current.zoom = fitZoom
    
    const pageScreenWidth = PAGE_WIDTH_WORLD * fitZoom
    const leftMargin = (cssWidth - pageScreenWidth) / 2
    transformRef.current.panX = -leftMargin / fitZoom
    transformRef.current.panY = -40 / fitZoom

    setTransform(fitZoom, transformRef.current.panX, transformRef.current.panY)
    renderBackgroundLayer()
    renderCommittedLayer()
    scheduleRender()
  }, [setTransform, renderBackgroundLayer, renderCommittedLayer, scheduleRender])

  // 3. Effects
  useEffect(() => {
    hydrate()
  }, [hydrate])

  useEffect(() => {
    let resizeTimer: any
    const onResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(initializeCanvasView, 100)
    }
    window.addEventListener('resize', onResize)
    initializeCanvasView()
    return () => window.removeEventListener('resize', onResize)
  }, [initializeCanvasView])

  // Input Listener
  useEffect(() => {
    const canvas = activeCanvasRef.current
    if (!canvas) return
    
    const inputHandler = new InputHandler({
      canvas,
      transform: transformRef.current,
      getActiveTool: () => useToolStore.getState().activeTool,
      getInputMode: () => useToolStore.getState().inputMode,
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
          
          // Auto-extend page at halfway mark (A4 height increments)
          if (stroke.bbox.maxY > pageHeight - 500) {
            setPageHeight(pageHeight + A4_HEIGHT_WORLD)
          }
          renderCommittedLayer()
        }
        currentPointsRef.current = []
        scheduleRender()
      },
      onEraserMove: (worldX, worldY, screenX, screenY) => {
        eraserRef.current.lastScreenPos = { x: screenX, y: screenY }
        const changed = eraserRef.current.checkHits(worldX, worldY, eraserRadius, undoRedoRef.current.getStrokes())
        if (changed) scheduleRender()
        scheduleRender() // also for cursor
      },
      onEraserEnd: () => {
        eraserRef.current.commitErase()
        scheduleRender()
      },
      onScroll: (dsy) => {
        transformRef.current.applyScrollY(dsy)
        setTransform(transformRef.current.zoom, transformRef.current.panX, transformRef.current.panY)
        renderBackgroundLayer()
        renderCommittedLayer()
        scheduleRender()
      },
      onZoom: (newZoom, midX, midY) => {
        transformRef.current.setZoomToward(newZoom, midX, midY)
        setTransform(transformRef.current.zoom, transformRef.current.panX, transformRef.current.panY)
        renderBackgroundLayer()
        renderCommittedLayer()
        scheduleRender()
      },
      onPan: (dx, dy) => {
        transformRef.current.applyPan(dx, dy)
        setTransform(transformRef.current.zoom, transformRef.current.panX, transformRef.current.panY)
        renderBackgroundLayer()
        renderCommittedLayer()
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
      eraserRef.current.lastScreenPos = { x: -1000, y: -1000 }
      scheduleRender()
    }

    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerleave', onLeave)
    return () => {
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onLeave)
    }
  }, [penColor, penWidth, eraserRadius, pageHeight, setPageHeight, setTransform, renderBackgroundLayer, renderCommittedLayer, scheduleRender])

  // Theme change side-effect: Invert default colors
  useEffect(() => {
    const currentStrokes = undoRedoRef.current.getStrokes()
    const inverted = invertStrokes(currentStrokes, darkMode)
    
    // We don't push a new undo action for auto-inversion, we just patch the data
    // so that black stays visible in dark mode.
    // In a real app, we'd replace the whole list in our UndoRedo internal state.
    const stack = undoRedoRef.current as any
    stack.strokes = inverted
    
    renderBackgroundLayer()
    renderCommittedLayer()
    scheduleRender()
  }, [darkMode, renderBackgroundLayer, renderCommittedLayer, scheduleRender])

  return {
    bgCanvasRef, committedCanvasRef, activeCanvasRef, cursorCanvasRef,
    undo: () => undoRedoRef.current.undo(),
    redo: () => undoRedoRef.current.redo(),
    fitPage: initializeCanvasView
  }
}
