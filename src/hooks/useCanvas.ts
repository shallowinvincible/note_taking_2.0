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
import { computeBBox, genId, type Point, type Stroke } from '@/types/stroke'
import { db } from '@/storage/db'
import { createPageSession } from '@/crdt/yjsSetup'
import { useNotebookStore } from '@/store/notebookStore'
import * as Y from 'yjs'
import { createPage } from '@/storage/pages'

const PAGE_WIDTH_WORLD = 795
const A4_HEIGHT_WORLD = 1122
// Each cached page is an OffscreenCanvas of (795*scale x 1122*scale). At the old
// scale of 3 that was ~32 MB PER page, and with ~11 pages kept in memory iOS
// Safari simply ran out of canvas memory and ground to a halt. Tie the buffer
// resolution to the device pixel ratio (capped at 2) — that's enough to stay
// crisp at the fit zoom while roughly halving memory per page.
const BUFFER_SCALE = typeof window !== 'undefined'
  ? Math.min(2, Math.max(1, Math.round(window.devicePixelRatio || 1)))
  : 2

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
  // Guards initializeCanvasView — only reset pan/zoom when a NEW NOTEBOOK is
  // opened, never when switching pages (continuous scroll) or when tool state
  // (color, mode, dark mode, etc.) triggers a re-render.
  const lastInitializedNotebookIdRef = useRef<string | null>(null)
  // Prevents a burst of strokes near the bottom of the last page from spawning
  // many blank pages at once.
  const isExtendingRef = useRef(false)
  // Per-page debounce timers for the Dexie thumbnail cache write.
  const saveTimersRef = useRef<Map<string, any>>(new Map())

  const {
    activeTool, penColor, penWidth, eraserRadius, pressureEnabled,
    background, darkMode, hydrate
  } = useToolStore()
  const {
    setTransform, setPageHeight, setCurrentPageBottom, setUndoRedo,
    pageHeight, currentPageBottom
  } = useCanvasStore()

  const {
    activeNotebook,
    activePage,
    pages,
    setPages,
    setAutosaving
  } = useNotebookStore()
  
  const pageId = activePage?.id || null
  const notebookId = activeNotebook?.id || null

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

    // Update active page explicitly for UI counting
    const viewportCenterWorldY = transformRef.current.panY + (window.innerHeight / 2 / transformRef.current.zoom);
    const newIdx = Math.max(1, Math.floor(viewportCenterWorldY / A4_HEIGHT_WORLD) + 1);
    const store = useCanvasStore.getState();
    if (newIdx !== store.activePageIndex && newIdx > 0 && newIdx <= useNotebookStore.getState().pages.length) {
       store.setActivePageIndex(newIdx);
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

  const undoRedoRef = useRef<UndoRedoStack>(new UndoRedoStack([], (strokes, action) => {
    updateUndoRedoState()

    // REQUIREMENT 3/4: High-Performance incremental path.
    // If we just added a stroke, the incremental render already happened.
    // We only need a full rebuild for undo/redo or batched erasers.
    if (!action || action.type !== 'ADD_STROKE') {
      fullRedrawCachedLayer()
    }
  }))

  // --- Lifecycle & Initialization ---

  /** 
   * Incremental Page Creation (Requirement 5)
   * Adding a page is now O(1) as it only updates state. 
   * Buffers are created on-demand during the next render.
   */
  const extendPage = useCallback(async () => {
    // Lock against re-entry: without this, several strokes near the page bottom
    // each pass the "reached the bottom" test before React state updates and we
    // spawn a burst of blank pages — which is exactly what made the page counter
    // fluctuate and the canvas flicker. Read fresh state from the stores rather
    // than closed-over values so the lock and page math are always current.
    if (isExtendingRef.current) return
    const notebook = useNotebookStore.getState().activeNotebook
    if (!notebook) return
    isExtendingRef.current = true
    try {
      const bg = useToolStore.getState().background
      const newPage = await createPage(notebook.id, bg)
      const updatedList = [...useNotebookStore.getState().pages, newPage]
      setPages(updatedList)
      setPageHeight(updatedList.length * A4_HEIGHT_WORLD)
      setCurrentPageBottom(updatedList.length * A4_HEIGHT_WORLD)
    } finally {
      isExtendingRef.current = false
    }
  }, [setPages, setPageHeight, setCurrentPageBottom])

  const scrollPageIntoView = useCallback((pageIndex: number) => {
    const targetY = pageIndex * A4_HEIGHT_WORLD - 40 / transformRef.current.zoom
    transformRef.current.panY = targetY
    setTransform(transformRef.current.zoom, transformRef.current.panX, transformRef.current.panY)
    renderBackgroundLayer()
    redrawCachedLayerFromBuffer()
    scheduleRender()
  }, [renderBackgroundLayer, redrawCachedLayerFromBuffer, scheduleRender, setTransform])

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

  useEffect(() => {
    // Initialize (reset pan/zoom to the top) ONCE per notebook. In continuous-
    // scroll mode every page lives on one tall canvas, so changing the active
    // page must NOT re-init the view — otherwise tapping a page in the sidebar
    // snaps straight back to the top of page 1. Page-to-page navigation is done
    // by scrollToPage instead.
    if (notebookId && bgCanvasRef.current && committedCanvasRef.current) {
      if (notebookId !== lastInitializedNotebookIdRef.current) {
        lastInitializedNotebookIdRef.current = notebookId
        initializeCanvasView()
      }
    }
  }, [notebookId, pageId, initializeCanvasView])

  // --- Input Handling Lifecycle (Requirement 1 - Stable Input) ---

  // 1. Creation/Destruction (Only when canvas changes or page changes)
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
      onStrokeStart: () => { },
      onStrokeMove: () => { },
      onStrokeEnd: () => { },
      onEraserMove: () => { },
      onEraserStart: () => { },
      onEraserEnd: () => { },
      onScroll: () => { },
      onZoom: () => { },
      onPan: () => { },
      onRenderRequest: () => { }
    }

    inputHandlerRef.current = new InputHandler(config)

    return () => {
      if (inputHandlerRef.current) {
        inputHandlerRef.current.destroy()
        inputHandlerRef.current = null
      }
    }
    // Recreate only when the notebook (and therefore the canvas element) changes,
    // NOT on every page switch — tearing the listeners down and rebuilding them
    // mid-session is wasteful and can drop input.
  }, [notebookId])

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
        const points = [...currentPointsRef.current];
        currentPointsRef.current = []; // HARD RESET: Clear state immediately (Requirement - Hard Reset)
        scheduleRender(); // Clear active layer immediately

        if (points.length > 1) {
          const stroke: Stroke = {
            id: genId(),
            tool: useToolStore.getState().activeTool,
            color: useToolStore.getState().penColor,
            width: useToolStore.getState().penWidth,
            points: points,
            bbox: computeBBox(points),
            createdAt: Date.now(),
            simulatePressure: useToolStore.getState().activeTool === 'finger' || !useToolStore.getState().pressureEnabled
          }

          // DECOUPLED COMMIT (Requirement - Separate Input from Commit)
          // Moving heavy operations to microtask allows the thread to process the next pointerdown immediately.
          queueMicrotask(() => {
            const commitStartTime = perf.startMeasure('commitStroke-Async');
            undoRedoRef.current.push({ type: 'ADD_STROKE', stroke })
            pageManagerRef.current.renderStrokeToPages(stroke, pressureEnabled);
            const committedCtx = committedCanvasRef.current?.getContext('2d');
            if (committedCtx) {
              renderStroke(committedCtx, stroke, transformRef.current, 1.0, pressureEnabled);
            }
            const freshBottom = useCanvasStore.getState().currentPageBottom
            if (stroke.bbox.maxY > freshBottom - 561 && !isExtendingRef.current) {
              extendPage()
            }
            perf.endMeasure(commitStartTime, 'commitStroke-Async');
          });
        }
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
    // notebookId is included so that when the InputHandler is recreated on a
    // notebook switch (dummy config), this effect re-runs and applies the real
    // callbacks to the new handler — otherwise drawing would silently no-op.
  }, [notebookId, pageHeight, currentPageBottom, extendPage, renderBackgroundLayer, redrawCachedLayerFromBuffer, renderWithErasePreview, setTransform, pressureEnabled, eraserRadius, darkMode, scheduleRender])

  useEffect(() => {
    const inverted = invertStrokes(undoRedoRef.current.getStrokes(), darkMode)
      // Mutating undo/redo strokes array specifically to flip colors globally.
      ; (undoRedoRef.current as any).strokes = inverted
    fullRedrawCachedLayer()
    renderBackgroundLayer()
    scheduleRender()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [darkMode])

  // Redraw background when template background option or page height changes
  useEffect(() => {
    renderBackgroundLayer()
    scheduleRender()
  }, [background, pageHeight, renderBackgroundLayer, scheduleRender])

  // Synchronize Yjs session with all pages for continuous multi-page rendering
  const pageIdsStr = pages.map(p => p.id).join(',')
  const activeSessionsRef = useRef<Map<string, any>>(new Map())
  const activeObserversRef = useRef<Map<string, (event: Y.YArrayEvent<Stroke>) => void>>(new Map())

  useEffect(() => {
    if (!activeNotebook || pages.length === 0) {
      if (activeSessionsRef.current.size > 0) {
        undoRedoRef.current.setSessions(new Map(), [])
        activeSessionsRef.current.forEach(s => s.persistence?.destroy())
        activeSessionsRef.current.clear()
        activeObserversRef.current.clear()
        fullRedrawCachedLayer()
      }
      return
    }

    let mounted = true
    const currentIds = pages.map(p => p.id)
    
    // Destroy removed sessions (e.g., notebook switched or page deleted)
    const currentKeys = Array.from(activeSessionsRef.current.keys())
    const oldIds = currentKeys.filter(id => !currentIds.includes(id))
    oldIds.forEach(id => {
      const s = activeSessionsRef.current.get(id)
      const obs = activeObserversRef.current.get(id)
      if (obs) s.strokesArray.unobserve(obs)
      s.persistence?.destroy()
      activeSessionsRef.current.delete(id)
      activeObserversRef.current.delete(id)
    })

    // Initialize new sessions
    const newIds = currentIds.filter(id => !activeSessionsRef.current.has(id))
    
    if (newIds.length > 0) {
      const initNew = async () => {
        const newSessions = new Map<string, any>()
        for (const pageId of newIds) {
          const session = createPageSession(pageId)
          newSessions.set(pageId, session)
          activeSessionsRef.current.set(pageId, session)
        }

        await Promise.all(
          Array.from(newSessions.values()).map(s => s.syncedPromise)
        )

        if (!mounted) return

        // Set up observers for new sessions
        for (const [pageId, session] of newSessions.entries()) {
          const observer = (event: Y.YArrayEvent<Stroke>) => {
            if (!mounted) return
            updateUndoRedoState()

            // A locally-added stroke was already painted incrementally on commit;
            // only remote / undo / erase changes need a full re-render here.
            if (event.transaction.origin !== 'local-add') {
              fullRedrawCachedLayer()
            }

            // Persist to Dexie for the sidebar thumbnails — DEBOUNCED per page.
            // The old code deleted and re-inserted EVERY stroke on the page on
            // EVERY stroke, so writing turned into an O(n) IndexedDB rewrite per
            // pen-up and the iPad fell over after a couple of pages. Yjs +
            // y-indexeddb already persist the real data incrementally; this is
            // only a thumbnail cache, so one write ~1s after the last change is
            // plenty and keeps the write off the drawing hot path.
            setAutosaving(true)
            const existing = saveTimersRef.current.get(pageId)
            if (existing) clearTimeout(existing)
            saveTimersRef.current.set(pageId, setTimeout(async () => {
              saveTimersRef.current.delete(pageId)
              try {
                const currentStrokes = session.strokesArray.toArray()
                await db.transaction('rw', [db.strokes], async () => {
                  await db.strokes.where('pageId').equals(pageId).delete()
                  if (currentStrokes.length > 0) {
                    await db.strokes.bulkPut(currentStrokes.map((s: Stroke) => ({ ...s, pageId })))
                  }
                })
              } catch (err) {
                console.error('Dexie save error:', err)
              } finally {
                if (mounted) setAutosaving(false)
              }
            }, 1000))
          }
          session.strokesArray.observe(observer)
          activeObserversRef.current.set(pageId, observer)
        }

        undoRedoRef.current.setSessions(activeSessionsRef.current, pages.map(p => p.id))
        fullRedrawCachedLayer()
      }
      initNew()
    } else {
      // Just update array order if needed
      undoRedoRef.current.setSessions(activeSessionsRef.current, pages.map(p => p.id))
    }

    return () => {
      mounted = false
      // Note: We deliberately do NOT destroy sessions here during cleanup of this effect,
      // so active sessions survive across dynamic page additions! Cleanups happen top-down 
      // or during standard unmount lifecycle if we wanted to (handled partly by top if-check).
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNotebook, pageIdsStr, fullRedrawCachedLayer, updateUndoRedoState, setAutosaving])

  return {
    bgCanvasRef, committedCanvasRef, activeCanvasRef, cursorCanvasRef,
    undo: () => undoRedoRef.current.undo(),
    redo: () => undoRedoRef.current.redo(),
    fitPage: initializeCanvasView,
    scrollToPage: scrollPageIntoView
  }
}
