import { useEffect, useRef, useCallback } from 'react'
import { TransformSystem } from '@/canvas/TransformSystem'
import { InputHandler, type InputHandlerConfig } from '@/canvas/InputHandler'
import { UndoRedoStack } from '@/canvas/UndoRedo'
import { renderActiveStroke, renderStroke } from '@/canvas/StrokeEngine'
import { renderBackground } from '@/canvas/BackgroundRenderer'
import { EraserSystem } from '@/canvas/EraserSystem'
import { PageManager } from '@/canvas/PageManager'
import { perf } from '@/canvas/PerformanceMonitor'
import { useToolStore, invertStrokes } from '@/store/toolStore'
import { useCanvasStore } from '@/store/canvasStore'
import { computeBBox, type Point, type Stroke } from '@/types/stroke'

const PAGE_WIDTH_WORLD = 795
const A4_HEIGHT_WORLD = 1122
const BUFFER_SCALE = 3.0 

export function useCanvas() {
  const bgCanvasRef = useRef<HTMLCanvasElement>(null)
  const committedCanvasRef = useRef<HTMLCanvasElement>(null)
  const activeCanvasRef = useRef<HTMLCanvasElement>(null)
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null)
  
  // Page-based buffer management
  const pageManagerRef = useRef(new PageManager(PAGE_WIDTH_WORLD, A4_HEIGHT_WORLD, BUFFER_SCALE))

  const transformRef = useRef(new TransformSystem())
  const eraserRef = useRef(new EraserSystem())
  
  const currentPointsRef = useRef<Point[]>([])
  const inputHandlerRef = useRef<InputHandler | null>(null)
  const renderPendingRef = useRef(false)
  const lastTimeRef = useRef(performance.now())

  const { 
    activeTool, penColor, penWidth, eraserRadius, pressureEnabled,
    background, darkMode, hydrate 
  } = useToolStore()
  const { 
    setTransform, setPageHeight, setCurrentPageBottom, setUndoRedo, 
    pageHeight, currentPageBottom 
  } = useCanvasStore()

  // --- Rendering Architecture (Virtualized Tiled Rendering) ---
  
  const redrawCachedLayerFromBuffer = useCallback(() => {
    const startTime = perf.startMeasure('redrawCachedLayer');
    
    const canvas = committedCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    
    // Clear the main viewing area
    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.scale(dpr, dpr)
    
    // Render only visible pages
    const { panX, panY, zoom } = transformRef.current;
    const viewportHeight = canvas.height / dpr;
    const viewportWidth = canvas.width / dpr;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const metrics = pageManagerRef.current.renderToScreen(
      ctx,
      panX, 
      panY, 
      zoom, 
      viewportWidth,
      viewportHeight,
      undoRedoRef.current.getStrokes(),
      pressureEnabled,
      eraserRef.current.pendingErase
    );
    
    ctx.restore();
    
    perf.recordFrame(perf.endMeasure(startTime, 'redrawCachedLayer'));
  }, [pressureEnabled])

  const rebuildOffscreenCanvas = useCallback(() => {
    const startTime = perf.startMeasure('rebuildOffscreenCanvas');
    pageManagerRef.current.rebuildPages(
      undoRedoRef.current.getStrokes(),
      pressureEnabled,
      eraserRef.current.pendingErase
    );
    perf.endMeasure(startTime, 'rebuildOffscreenCanvas');
  }, [pressureEnabled])

  const fullRedrawCachedLayer = useCallback(() => {
    rebuildOffscreenCanvas()
    redrawCachedLayerFromBuffer()
  }, [rebuildOffscreenCanvas, redrawCachedLayerFromBuffer])

  const renderActiveLayer = useCallback(() => {
    const canvas = activeCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    
    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    if (currentPointsRef.current.length < 1) return

    const allPoints = [...currentPointsRef.current]
    const handler = inputHandlerRef.current
    if (handler && handler.lastPointerEvent && (handler.lastPointerEvent as any).getPredictedEvents) {
      const rect = canvas.getBoundingClientRect()
      const livePageHeight = useCanvasStore.getState().pageHeight
      for (const predicted of (handler.lastPointerEvent as any).getPredictedEvents()) {
        const w = transformRef.current.screenToWorld(predicted.clientX - rect.left, predicted.clientY - rect.top)
        allPoints.push({
          x: Math.min(Math.max(w.x, 0), PAGE_WIDTH_WORLD),
          y: Math.min(Math.max(w.y, 0), livePageHeight),
          pressure: handler.getPointPressure(predicted as any)
        })
      }
    }

    renderActiveStroke(ctx, allPoints, penColor, penWidth, transformRef.current, pressureEnabled, activeTool === 'finger')
  }, [penColor, penWidth, activeTool, pressureEnabled])

  const renderBackgroundLayer = useCallback(() => {
    const canvas = bgCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
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

  const renderWithErasePreview = useCallback(() => {
    const canvas = committedCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return

    redrawCachedLayerFromBuffer()

    const zoom = transformRef.current.zoom
    const strokes = undoRedoRef.current.getStrokes()
    
    for (const strokeId of eraserRef.current.pendingErase) {
      const stroke = strokes.find(s => s.id === strokeId)
      if (!stroke) continue

      const { x: sx, y: sy } = transformRef.current.worldToScreen(stroke.bbox.minX - 4, stroke.bbox.minY - 4)
      const sw = (stroke.bbox.maxX - stroke.bbox.minX + 8) * zoom
      const sh = (stroke.bbox.maxY - stroke.bbox.minY + 8) * zoom
      
      ctx.fillStyle = darkMode ? '#1e1e1e' : '#ffffff'
      ctx.fillRect(sx, sy, sw, sh)

      renderStroke(ctx, stroke, transformRef.current, 0.3, pressureEnabled)
    }
  }, [redrawCachedLayerFromBuffer, darkMode, pressureEnabled])

  // --- Animation Loop ---

  const renderLoop = useCallback((time: number) => {
    renderPendingRef.current = false
    const dt = time - lastTimeRef.current
    lastTimeRef.current = time

    const isEraserAnimating = eraserRef.current.tick(dt)
    const deletedIds = eraserRef.current.getDeletedAndClear()
    
    if (deletedIds.length > 0) {
      const strokesToRemove = undoRedoRef.current.getStrokes().filter(s => deletedIds.includes(s.id))
      if (strokesToRemove.length > 0) {
        undoRedoRef.current.push({ type: 'ERASE_STROKES', strokes: strokesToRemove })
      }
    }

    if (isEraserAnimating) {
       renderWithErasePreview()
    }
    renderActiveLayer()
    
    // Performance Tracking (Requirement 9)
    if (perf.debugEnabled) {
      const { start, end } = pageManagerRef.current.getVisiblePageRange(transformRef.current.panY, transformRef.current.zoom, window.innerHeight);
      const pgMetrics = pageManagerRef.current.getMetrics(end - start + 1);
      const pfMetrics = perf.getMetrics();
      if (time % 1000 < 20) { // log roughly once per second
        console.log(`[PERF] FPS: ${pfMetrics.fps} | VisPages: ${pgMetrics.visible}/${pgMetrics.total} | Mem: ${pgMetrics.memoryEstimate}`);
      }
    }

    if (isEraserAnimating) {
      renderPendingRef.current = true
      requestAnimationFrame(renderLoop)
    }
  }, [renderActiveLayer, renderWithErasePreview])

  const scheduleRender = useCallback(() => {
    if (renderPendingRef.current) return
    renderPendingRef.current = true
    requestAnimationFrame(renderLoop)
  }, [renderLoop])

  const updateUndoRedoState = useCallback(() => {
    setUndoRedo(undoRedoRef.current.canUndo(), undoRedoRef.current.canRedo())
  }, [setUndoRedo])

  const undoRedoRef = useRef<UndoRedoStack>(new UndoRedoStack([], () => {
    updateUndoRedoState()
    fullRedrawCachedLayer()
  }))

  // --- Lifecycle & Initialization ---
  
  /** 
   * Incremental Page Creation (Requirement 5)
   * Adding a page is now O(1) as it only updates state. 
   * Buffers are created on-demand during the next render.
   */
  const extendPage = useCallback(() => {
    const newHeight = pageHeight + A4_HEIGHT_WORLD
    setPageHeight(newHeight)
    setCurrentPageBottom(currentPageBottom + A4_HEIGHT_WORLD)

    renderBackgroundLayer()
    redrawCachedLayerFromBuffer()
  }, [pageHeight, currentPageBottom, setPageHeight, setCurrentPageBottom, renderBackgroundLayer, redrawCachedLayerFromBuffer])

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
      }
    })

    // initOffscreenCanvas call removed - PageManager handles lazily
    const horizontalPadding = 80
    const fitZoom = (cssWidth - horizontalPadding) / PAGE_WIDTH_WORLD
    transformRef.current.zoom = fitZoom
    const pageScreenWidth = PAGE_WIDTH_WORLD * fitZoom
    const leftMargin = (cssWidth - pageScreenWidth) / 2
    transformRef.current.panX = -leftMargin / fitZoom
    transformRef.current.panY = -40 / fitZoom

    setTransform(fitZoom, transformRef.current.panX, transformRef.current.panY)
    fullRedrawCachedLayer()
    renderBackgroundLayer()
    scheduleRender()
  }, [fullRedrawCachedLayer, renderBackgroundLayer, setTransform, scheduleRender])

  useEffect(() => {
    hydrate()
  }, [hydrate])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const curCtx = cursorCanvasRef.current?.getContext('2d')
      if (!curCtx || !cursorCanvasRef.current) return
      
      curCtx.save()
      curCtx.setTransform(1, 0, 0, 1, 0, 0)
      curCtx.clearRect(0, 0, cursorCanvasRef.current.width, cursorCanvasRef.current.height)
      curCtx.restore()

      const wx = transformRef.current.screenToWorld(e.clientX, e.clientY).x
      const wy = transformRef.current.screenToWorld(e.clientX, e.clientY).y
      
      const onPage = wx >= 0 && wx <= PAGE_WIDTH_WORLD && wy >= 0 && wy <= useCanvasStore.getState().pageHeight
      if (!onPage) {
        cursorCanvasRef.current.style.cursor = 'default'
        return
      }

      cursorCanvasRef.current.style.cursor = 'none'

      const activeTool = useToolStore.getState().activeTool
      const currentPenColor = useToolStore.getState().penColor
      const zoomLevel = transformRef.current.zoom
      const sx = e.clientX
      const sy = e.clientY

      if (activeTool === 'pen') {
        const radius = Math.max((useToolStore.getState().penWidth * zoomLevel) / 2, 3)
        curCtx.beginPath()
        curCtx.arc(sx, sy, radius, 0, Math.PI * 2)
        curCtx.fillStyle = currentPenColor + 'aa'
        curCtx.fill()
        const isDarkMode = useToolStore.getState().darkMode
        curCtx.strokeStyle = isDarkMode ? '#ffffff44' : '#00000044'
        curCtx.lineWidth = 1
        curCtx.stroke()
      } else if (activeTool === 'eraser') {
        const radius = useToolStore.getState().eraserRadius * zoomLevel
        curCtx.beginPath()
        curCtx.arc(sx, sy, radius, 0, Math.PI * 2)
        const isDarkMode = useToolStore.getState().darkMode
        curCtx.fillStyle = isDarkMode ? '#33333388' : '#ffffff88'
        curCtx.fill()
        curCtx.strokeStyle = isDarkMode ? '#ffffff' : '#333333'
        curCtx.lineWidth = 1.5
        curCtx.stroke()
      }
    }

    const onMouseLeave = () => {
      const curCtx = cursorCanvasRef.current?.getContext('2d')
      if (!curCtx || !cursorCanvasRef.current) return
      curCtx.save()
      curCtx.setTransform(1, 0, 0, 1, 0, 0)
      curCtx.clearRect(0, 0, cursorCanvasRef.current.width, cursorCanvasRef.current.height)
      curCtx.restore()
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseleave', onMouseLeave)
    
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])

  useEffect(() => {
    let resizeTimer: any
    const onResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        // Redraw only what's necessary on resize
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
          }
        })
        renderBackgroundLayer()
        redrawCachedLayerFromBuffer()
        scheduleRender()
      }, 100)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [redrawCachedLayerFromBuffer, renderBackgroundLayer, scheduleRender])

  const initialized = useRef(false)
  useEffect(() => {
    if (!initialized.current) {
      initializeCanvasView()
      initialized.current = true
    }
  }, [initializeCanvasView])

  // --- Input Handling Lifecycle (Requirement 1 - Stable Input) ---
  
  // 1. Creation/Destruction (Only when canvas changes)
  useEffect(() => {
    const canvas = activeCanvasRef.current
    if (!canvas) return
    
    // Create a dummy config initially
    const config: InputHandlerConfig = {
      canvas,
      transform: transformRef.current,
      getActiveTool: () => useToolStore.getState().activeTool,
      getInputMode: () => useToolStore.getState().inputMode,
      isPressureEnabled: () => useToolStore.getState().pressureEnabled,
      getPageHeight: () => useCanvasStore.getState().pageHeight,
      onStrokeStart: () => {},
      onStrokeMove: () => {},
      onStrokeEnd: () => {},
      onEraserMove: () => {},
      onEraserStart: () => {},
      onEraserEnd: () => {},
      onScroll: () => {},
      onZoom: () => {},
      onPan: () => {},
      onRenderRequest: () => {}
    }
    
    inputHandlerRef.current = new InputHandler(config)

    return () => {
      if (inputHandlerRef.current) {
        inputHandlerRef.current.destroy()
        inputHandlerRef.current = null
      }
    }
  }, []) // Empty dependency array means it only runs on mount/unmount

  // 2. Dynamic Configuration Updates
  useEffect(() => {
    if (!inputHandlerRef.current) return

    inputHandlerRef.current.updateConfig({
      canvas: activeCanvasRef.current!,
      transform: transformRef.current,
      getActiveTool: () => useToolStore.getState().activeTool,
      getInputMode: () => useToolStore.getState().inputMode,
      isPressureEnabled: () => useToolStore.getState().pressureEnabled,
      getPageHeight: () => useCanvasStore.getState().pageHeight,
      onStrokeStart: (e, simulatePressure) => {
        currentPointsRef.current = []
        scheduleRender()
      },
      onStrokeMove: (points) => {
        currentPointsRef.current = [...currentPointsRef.current, ...points]
        scheduleRender()
      },
      onStrokeEnd: () => {
        const startTime = perf.startMeasure('onStrokeEnd-Handler');
        if (currentPointsRef.current.length > 1) {
          const stroke: Stroke = {
            id: crypto.randomUUID(),
            tool: useToolStore.getState().activeTool,
            color: useToolStore.getState().penColor,
            width: useToolStore.getState().penWidth,
            points: [...currentPointsRef.current],
            bbox: computeBBox(currentPointsRef.current),
            createdAt: Date.now(),
            simulatePressure: useToolStore.getState().activeTool === 'finger' || !useToolStore.getState().pressureEnabled
          }

          queueMicrotask(() => {
            const commitStartTime = perf.startMeasure('commitStroke-Async');
            undoRedoRef.current.push({ type: 'ADD_STROKE', stroke })
            pageManagerRef.current.renderStrokeToPages(stroke, pressureEnabled);
            const committedCtx = committedCanvasRef.current?.getContext('2d');
            if (committedCtx) {
              renderStroke(committedCtx, stroke, transformRef.current, 1.0, pressureEnabled);
            }
            const triggerY = currentPageBottom - 561
            if (stroke.bbox.maxY > triggerY) {
              extendPage()
            }
            perf.endMeasure(commitStartTime, 'commitStroke-Async');
          });
        }
        currentPointsRef.current = []
        scheduleRender()
        perf.endMeasure(startTime, 'onStrokeEnd-Handler');
      },
      onEraserMove: (worldX, worldY, screenX, screenY) => {
        eraserRef.current.lastScreenPos = { x: screenX, y: screenY }
        const changed = eraserRef.current.checkHits(worldX, worldY, eraserRadius, undoRedoRef.current.getStrokes())
        if (changed) renderWithErasePreview()
        scheduleRender()
      },
      onEraserStart: () => {
        eraserRef.current.resetLastPos()
      },
      onEraserEnd: () => {
        eraserRef.current.commitErase()
        scheduleRender()
      },
      onScroll: (dsy) => {
        transformRef.current.applyScrollY(dsy)
        setTransform(transformRef.current.zoom, transformRef.current.panX, transformRef.current.panY)
        renderBackgroundLayer()
        redrawCachedLayerFromBuffer()
        scheduleRender()
      },
      onZoom: (newZoom, midX, midY) => {
        transformRef.current.setZoomToward(newZoom, midX, midY)
        setTransform(transformRef.current.zoom, transformRef.current.panX, transformRef.current.panY)
        renderBackgroundLayer()
        redrawCachedLayerFromBuffer()
        scheduleRender()
      },
      onPan: (dx, dy) => {
        transformRef.current.applyPan(dx, dy)
        setTransform(transformRef.current.zoom, transformRef.current.panX, transformRef.current.panY)
        renderBackgroundLayer()
        redrawCachedLayerFromBuffer()
        scheduleRender()
      },
      onRenderRequest: scheduleRender
    })
  }, [pageHeight, currentPageBottom, extendPage, renderBackgroundLayer, redrawCachedLayerFromBuffer, renderWithErasePreview, setTransform, pressureEnabled, eraserRadius, darkMode, scheduleRender])

  useEffect(() => {
    const inverted = invertStrokes(undoRedoRef.current.getStrokes(), darkMode)
    // Mutating undo/redo strokes array specifically to flip colors globally.
    ;(undoRedoRef.current as any).strokes = inverted
    fullRedrawCachedLayer()
    renderBackgroundLayer()
    scheduleRender()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [darkMode])

  return {
    bgCanvasRef, committedCanvasRef, activeCanvasRef, cursorCanvasRef,
    undo: () => { undoRedoRef.current.undo(); },
    redo: () => { undoRedoRef.current.redo(); },
    fitPage: initializeCanvasView
  }
}
