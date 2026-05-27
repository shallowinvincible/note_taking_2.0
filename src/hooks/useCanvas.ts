'use client'

import { useEffect, useRef, useCallback } from 'react'
import { TransformSystem } from '@/canvas/TransformSystem'
import { InputHandler } from '@/canvas/InputHandler'
import { UndoRedoStack } from '@/canvas/UndoRedo'
import {
  renderActiveStroke,
  redrawCommittedLayer,
} from '@/canvas/StrokeEngine'
import { useToolStore } from '@/store/toolStore'
import { useCanvasStore } from '@/store/canvasStore'
import type { Point, Stroke, StrokeTool } from '@/types/stroke'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export interface UseCanvasReturn {
  committedCanvasRef: React.RefObject<HTMLCanvasElement>
  activeCanvasRef: React.RefObject<HTMLCanvasElement>
  undo: () => void
  redo: () => void
}

/**
 * useCanvas — wires the entire canvas engine to two <canvas> refs.
 *
 * Design rules enforced here:
 *   • No React state updates during a stroke (all mutable via refs)
 *   • requestAnimationFrame for every render — never setTimeout
 *   • All points stored in world coordinates
 *   • Committed layer redrawn only on stroke commit, undo/redo, or transform change
 */
export function useCanvas(): UseCanvasReturn {
  const committedCanvasRef = useRef<HTMLCanvasElement>(null)
  const activeCanvasRef = useRef<HTMLCanvasElement>(null)

  // Mutable engine objects live in refs — never in React state
  const transformRef = useRef(new TransformSystem())
  const currentPointsRef = useRef<Point[]>([])
  const rafPendingRef = useRef(false)
  const needsCommittedRedrawRef = useRef(true)

  // Access tool store values synchronously inside callbacks (no re-render during stroke)
  const toolStoreRef = useRef(useToolStore.getState())
  const setTransform = useCanvasStore((s) => s.setTransform)
  const setUndoRedo = useCanvasStore((s) => s.setUndoRedo)

  const undoRedoRef = useRef<UndoRedoStack | null>(null)
  const inputHandlerRef = useRef<InputHandler | null>(null)

  // ── RAF Render Loop ────────────────────────────────────────────────────

  const scheduleRender = useCallback(() => {
    if (rafPendingRef.current) return
    rafPendingRef.current = true
    requestAnimationFrame(renderFrame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function renderFrame() {
    rafPendingRef.current = false
    const activeCanvas = activeCanvasRef.current
    const committedCanvas = committedCanvasRef.current
    if (!activeCanvas || !committedCanvas) return

    const transform = transformRef.current
    const tool = toolStoreRef.current

    // Redraw committed layer only when needed (undo/redo/zoom/pan/load)
    if (needsCommittedRedrawRef.current) {
      const ctx = committedCanvas.getContext('2d')
      if (ctx) {
        redrawCommittedLayer(ctx, undoRedoRef.current?.getStrokes() ?? [], transform)
      }
      needsCommittedRedrawRef.current = false
    }

    // Always redraw active stroke layer
    const activeCtx = activeCanvas.getContext('2d')
    if (activeCtx) {
      activeCtx.clearRect(0, 0, activeCanvas.width, activeCanvas.height)
      if (currentPointsRef.current.length > 0) {
        renderActiveStroke(
          activeCtx,
          currentPointsRef.current,
          tool.penColor,
          tool.activeTool === 'eraser' ? tool.eraserWidth : tool.penWidth,
          tool.activeTool,
          transform
        )
      }
    }
  }

  // ── Canvas Resize ──────────────────────────────────────────────────────

  const resizeCanvases = useCallback(() => {
    const committed = committedCanvasRef.current
    const active = activeCanvasRef.current
    if (!committed || !active) return

    const dpr = window.devicePixelRatio || 1
    const w = window.innerWidth
    const h = window.innerHeight

    ;[committed, active].forEach((c) => {
      c.width = Math.floor(w * dpr)
      c.height = Math.floor(h * dpr)
      c.style.width = `${w}px`
      c.style.height = `${h}px`
      const ctx = c.getContext('2d')
      if (ctx) ctx.scale(dpr, dpr)
    })

    needsCommittedRedrawRef.current = true
    scheduleRender()
  }, [scheduleRender])

  // ── Stroke Commit ──────────────────────────────────────────────────────

  const handleStrokeComplete = useCallback(
    (points: Point[], tool: StrokeTool) => {
      const storeState = toolStoreRef.current
      const stroke: Stroke = {
        id: generateId(),
        tool,
        color: storeState.penColor,
        width:
          tool === 'eraser' ? storeState.eraserWidth : storeState.penWidth,
        points,
        createdAt: Date.now(),
      }

      undoRedoRef.current?.push(stroke)

      // Update toolbar undo/redo state (this React state update is OUTSIDE the draw loop)
      setUndoRedo(
        undoRedoRef.current?.canUndo() ?? false,
        undoRedoRef.current?.canRedo() ?? false
      )

      needsCommittedRedrawRef.current = true
      scheduleRender()
    },
    [setUndoRedo, scheduleRender]
  )

  // ── Pan / Zoom callbacks (called from InputHandler) ────────────────────

  const handlePan = useCallback(
    (dx: number, dy: number) => {
      transformRef.current.applyPan(dx, dy)
      needsCommittedRedrawRef.current = true
      // Don't schedule render here — InputHandler already calls onRenderRequest
    },
    []
  )

  const handleZoom = useCallback(
    (delta: number, cx: number, cy: number) => {
      transformRef.current.applyZoom(delta, cx, cy)
      needsCommittedRedrawRef.current = true
    },
    []
  )

  // ── Undo / Redo (exposed to toolbar) ──────────────────────────────────

  const undo = useCallback(() => {
    undoRedoRef.current?.undo()
    setUndoRedo(
      undoRedoRef.current?.canUndo() ?? false,
      undoRedoRef.current?.canRedo() ?? false
    )
    needsCommittedRedrawRef.current = true
    scheduleRender()
  }, [setUndoRedo, scheduleRender])

  const redo = useCallback(() => {
    undoRedoRef.current?.redo()
    setUndoRedo(
      undoRedoRef.current?.canUndo() ?? false,
      undoRedoRef.current?.canRedo() ?? false
    )
    needsCommittedRedrawRef.current = true
    scheduleRender()
  }, [setUndoRedo, scheduleRender])

  // ── Mount / Unmount ────────────────────────────────────────────────────

  useEffect(() => {
    // Subscribe to tool store changes without re-rendering
    const unsub = useToolStore.subscribe((state) => {
      toolStoreRef.current = state
    })
    return unsub
  }, [])

  useEffect(() => {
    undoRedoRef.current = new UndoRedoStack(() => {
      // onChange fires after every push/undo/redo — no-op here, handled above
    })

    resizeCanvases()
    window.addEventListener('resize', resizeCanvases)

    // Keyboard shortcuts
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)

    // Attach input handler to the TOP (active) canvas
    const activeCanvas = activeCanvasRef.current
    if (activeCanvas) {
      const handler = new InputHandler({
        transform: transformRef.current,
        getActiveTool: () => toolStoreRef.current.activeTool,
        onStrokeComplete: handleStrokeComplete,
        onRenderRequest: scheduleRender,
        onPan: handlePan,
        onZoom: handleZoom,
        getCurrentPoints: () => currentPointsRef.current,
        setCurrentPoints: (pts) => {
          currentPointsRef.current = pts
        },
      })
      handler.attach(activeCanvas)
      inputHandlerRef.current = handler
    }

    return () => {
      window.removeEventListener('resize', resizeCanvases)
      window.removeEventListener('keydown', onKey)
      inputHandlerRef.current?.detach()
    }
  }, [resizeCanvases, undo, redo, handleStrokeComplete, scheduleRender, handlePan, handleZoom])

  // Sync transform to Zustand store periodically for toolbar display
  useEffect(() => {
    const id = setInterval(() => {
      const t = transformRef.current
      setTransform(t.zoom, t.panX, t.panY)
    }, 200)
    return () => clearInterval(id)
  }, [setTransform])

  return { committedCanvasRef, activeCanvasRef, undo, redo }
}
