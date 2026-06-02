import type { Point, StrokeTool } from '@/types/stroke'
import type { TransformSystem } from './TransformSystem'
import { perf } from './PerformanceMonitor'

export type InputMode = 'idle' | 'drawing-pen' | 'drawing-finger' | 'erasing' | 'scrolling' | 'zooming'

export interface InputHandlerConfig {
  canvas: HTMLCanvasElement
  transform: TransformSystem
  onStrokeStart: (e: PointerEvent, simulatePressure: boolean) => void
  onStrokeMove: (points: Point[]) => void
  onStrokeEnd: () => void
  onEraserMove: (worldX: number, worldY: number, screenX: number, screenY: number) => void
  onEraserStart: () => void
  onEraserEnd: () => void
  onScroll: (dsy: number) => void
  onZoom: (newZoom: number, midX: number, midY: number) => void
  onPan: (dx: number, dy: number) => void
  onRenderRequest: () => void
  getActiveTool: () => StrokeTool
  getInputMode: () => 'stylus' | 'finger'
  isPressureEnabled: () => boolean
  getPageHeight: () => number
}

const PAGE_WIDTH_WORLD = 795
const MIN_POINT_DISTANCE = 1.5

const DEBUG_PENCIL = true

export class InputHandler {
  private canvas: HTMLCanvasElement
  private transform: TransformSystem
  private config: InputHandlerConfig

  // --- Core state ---
  // mode is the single source of truth. It is always reset to 'idle' immediately on up/cancel.
  private mode: InputMode = 'idle'
  private activePenPointerId: number | null = null
  private activeTouchCount = 0

  // Pinch-zoom state (touch only)
  private initialPinchDist: number | null = null
  private initialZoom: number = 1
  private lastMidX = 0
  private lastMidY = 0
  private lastTouchX = 0
  private lastTouchY = 0

  // Distance filter
  private lastAddedPoint: Point | null = null

  public lastPointerEvent: PointerEvent | null = null

  private boundListeners: Record<string, EventListenerOrEventListenerObject> = {}

  constructor(config: InputHandlerConfig) {
    this.canvas = config.canvas
    this.transform = config.transform
    this.config = config
    this.canvas.style.touchAction = 'none'
    this.setupPointerEvents()
    this.setupTouchEvents()
  }

  public updateConfig(newConfig: InputHandlerConfig) {
    this.config = newConfig
    this.transform = newConfig.transform
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  private isInsidePage(wx: number, wy: number): boolean {
    return wx >= 0 && wx <= PAGE_WIDTH_WORLD &&
      wy >= 0 && wy <= this.config.getPageHeight()
  }

  private clampToPage(wx: number, wy: number) {
    return {
      x: Math.min(Math.max(wx, 0), PAGE_WIDTH_WORLD),
      y: Math.min(Math.max(wy, 0), this.config.getPageHeight())
    }
  }

  private shouldAddPoint(newX: number, newY: number): boolean {
    if (!this.lastAddedPoint) return true
    const dx = newX - this.lastAddedPoint.x
    const dy = newY - this.lastAddedPoint.y
    return Math.sqrt(dx * dx + dy * dy) >= MIN_POINT_DISTANCE
  }

  public getPointPressure(e: PointerEvent): number {
    if (!this.config.isPressureEnabled()) return 0.5
    return e.pressure > 0 ? e.pressure : 0.5
  }

  private screenToWorld(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect()
    return this.transform.screenToWorld(clientX - rect.left, clientY - rect.top)
  }

  // ─────────────────────────────────────────────
  // Stroke lifecycle helpers
  // ─────────────────────────────────────────────

  /** Begin a pen stroke. Called from pointerdown. */
  private beginPenStroke(e: PointerEvent) {
    // Always clean up any prior state. This is the safety net for rapid strokes.
    if (this.mode !== 'idle') {
      if (DEBUG_PENCIL) console.warn(`[PENCIL] beginPenStroke: forcing finish of mode=${this.mode}`)
      if (this.mode === 'drawing-pen' || this.mode === 'drawing-finger') {
        this.config.onStrokeEnd()
      } else if (this.mode === 'erasing') {
        this.config.onEraserEnd()
      }
    }

    this.activePenPointerId = e.pointerId
    this.lastAddedPoint = null

    if (this.config.getActiveTool() === 'eraser') {
      this.mode = 'erasing'
      this.config.onEraserStart()
      this.handleEraserMove(e)
    } else {
      this.mode = 'drawing-pen'
      this.config.onStrokeStart(e, false)
    }
  }

  /**
   * End the current pen stroke.
   * CRITICAL: mode is set to 'idle' FIRST, before calling any callback.
   * This means the next pointerdown can start a new stroke even if the
   * onStrokeEnd callback queues expensive async work.
   */
  private endPenStroke() {
    const prevMode = this.mode
    // ── HARD RESET FIRST ──────────────────────────────────────────────────
    this.mode = 'idle'
    this.activePenPointerId = null
    // ──────────────────────────────────────────────────────────────────────

    if (prevMode === 'drawing-pen' || prevMode === 'drawing-finger') {
      this.config.onStrokeEnd()   // fires after mode is already idle
    } else if (prevMode === 'erasing') {
      this.config.onEraserEnd()
    }
  }

  // ─────────────────────────────────────────────
  // Pointer Events
  // ─────────────────────────────────────────────

  private setupPointerEvents() {

    // ── pointerdown ──────────────────────────────────────────────────────
    this.boundListeners.pointerdown = ((e: PointerEvent) => {
      this.lastPointerEvent = e

      if (DEBUG_PENCIL && e.pointerType === 'pen') {
        console.log(`[PENCIL] ↓ down id=${e.pointerId} t=${e.timeStamp.toFixed(1)} mode=${this.mode}`)
      }

      if (e.pointerType === 'pen') {
        const world = this.screenToWorld(e.clientX, e.clientY)
        if (!this.isInsidePage(world.x, world.y)) {
          if (DEBUG_PENCIL) console.warn('[PENCIL] outside page – ignored')
          return
        }
        // No setPointerCapture for pen – Safari/iPadOS is more reliable without it.
        this.beginPenStroke(e)
        return
      }

      if (e.pointerType === 'touch') {
        this.activeTouchCount++
        this.lastTouchX = e.clientX
        this.lastTouchY = e.clientY

        if (this.activeTouchCount > 1) {
          if (this.mode === 'drawing-finger') this.config.onStrokeEnd()
          this.mode = this.activeTouchCount === 2 ? 'zooming' : 'idle'
          return
        }

        const world = this.screenToWorld(e.clientX, e.clientY)
        const inputMode = this.config.getInputMode()
        if (inputMode === 'finger') {
          if (!this.isInsidePage(world.x, world.y)) return
          this.canvas.setPointerCapture(e.pointerId)
          if (this.config.getActiveTool() === 'eraser') {
            this.mode = 'erasing'
            this.config.onEraserStart()
          } else {
            this.mode = 'drawing-finger'
            this.lastAddedPoint = null
            this.config.onStrokeStart(e, true)
          }
        } else {
          this.mode = 'scrolling'
          this.canvas.setPointerCapture(e.pointerId)
        }
        return
      }

      if (e.pointerType === 'mouse') {
        const world = this.screenToWorld(e.clientX, e.clientY)
        if (!this.isInsidePage(world.x, world.y)) return
        this.canvas.setPointerCapture(e.pointerId)
        if (this.config.getActiveTool() === 'eraser') {
          this.mode = 'erasing'
          this.config.onEraserStart()
          this.handleEraserMove(e)
        } else {
          this.mode = 'drawing-pen'
          this.lastAddedPoint = null
          this.config.onStrokeStart(e, false)
        }
      }
    }) as EventListener

    // ── pointermove ──────────────────────────────────────────────────────
    this.boundListeners.pointermove = ((e: PointerEvent) => {
      this.lastPointerEvent = e
      const rect = this.canvas.getBoundingClientRect()

      // Pen hover (pressure == 0, mode == idle) – just update cursor, ignore for drawing
      if (e.pointerType === 'pen' && e.pressure === 0 && this.mode === 'idle') return

      if (this.mode === 'idle') return

      if (this.mode === 'scrolling' && e.pointerType === 'touch') {
        const dx = e.clientX - this.lastTouchX
        const dy = e.clientY - this.lastTouchY
        this.config.onPan(dx * 0.6, dy * 0.6)
        this.lastTouchX = e.clientX
        this.lastTouchY = e.clientY
        return
      }

      if (this.mode === 'erasing') {
        // Only process pen eraser events from the active pen pointer
        if (e.pointerType === 'pen' && e.pointerId !== this.activePenPointerId) return
        this.handleEraserMove(e)
        return
      }

      if (this.mode === 'drawing-pen' || this.mode === 'drawing-finger') {
        // For pen, only process events from the active pen pointer
        if (e.pointerType === 'pen' && e.pointerId !== this.activePenPointerId) return

        const events = (e as any).getCoalescedEvents?.() ?? [e]
        const points: Point[] = []

        for (const ev of events) {
          const w = this.transform.screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top)
          const clamped = this.clampToPage(w.x, w.y)
          if (this.shouldAddPoint(clamped.x, clamped.y)) {
            const p = { x: clamped.x, y: clamped.y, pressure: this.getPointPressure(ev) }
            points.push(p)
            this.lastAddedPoint = p
          }
        }
        if (points.length > 0) this.config.onStrokeMove(points)
      }
    }) as EventListener

    // ── pointerup ────────────────────────────────────────────────────────
    this.boundListeners.pointerup = ((e: PointerEvent) => {
      // Release capture regardless of type
      try {
        if (this.canvas.hasPointerCapture(e.pointerId)) {
          this.canvas.releasePointerCapture(e.pointerId)
        }
      } catch (_) {}

      if (DEBUG_PENCIL && e.pointerType === 'pen') {
        console.log(`[PENCIL] ↑ up   id=${e.pointerId} t=${e.timeStamp.toFixed(1)} mode=${this.mode}`)
      }

      if (e.pointerType === 'pen') {
        if (e.pointerId === this.activePenPointerId || this.mode === 'drawing-pen' || this.mode === 'erasing') {
          this.endPenStroke()   // mode set to idle FIRST inside this method
        }
        return
      }

      if (e.pointerType === 'touch') {
        this.activeTouchCount = Math.max(0, this.activeTouchCount - 1)
        if (this.mode === 'drawing-finger' || this.mode === 'erasing' || this.mode === 'scrolling') {
          const prevMode = this.mode
          this.mode = 'idle'   // reset first
          if (prevMode === 'drawing-finger') this.config.onStrokeEnd()
          else if (prevMode === 'erasing') this.config.onEraserEnd()
        }
        if (this.activeTouchCount === 0) this.mode = 'idle'
        return
      }

      if (e.pointerType === 'mouse') {
        const prevMode = this.mode
        this.mode = 'idle'
        if (prevMode === 'drawing-pen') this.config.onStrokeEnd()
        else if (prevMode === 'erasing') this.config.onEraserEnd()
      }
    }) as EventListener

    // ── pointercancel ────────────────────────────────────────────────────
    // Safari emits pointercancel instead of pointerup in many cases (palm rejection,
    // app switcher, notification banner, etc.). We MUST treat it exactly like pointerup.
    this.boundListeners.pointercancel = ((e: PointerEvent) => {
      try {
        if (this.canvas.hasPointerCapture(e.pointerId)) {
          this.canvas.releasePointerCapture(e.pointerId)
        }
      } catch (_) {}

      if (DEBUG_PENCIL && e.pointerType === 'pen') {
        console.log(`[PENCIL] ✕ cancel id=${e.pointerId} t=${e.timeStamp.toFixed(1)} mode=${this.mode}`)
      }

      if (e.pointerType === 'pen') {
        this.endPenStroke()
        return
      }

      if (e.pointerType === 'touch') {
        this.activeTouchCount = Math.max(0, this.activeTouchCount - 1)
      }
      // For any type, reset mode and call appropriate callback
      const prevMode = this.mode
      this.mode = 'idle'
      this.activePenPointerId = null
      if (prevMode === 'drawing-pen' || prevMode === 'drawing-finger') this.config.onStrokeEnd()
      else if (prevMode === 'erasing') this.config.onEraserEnd()
    }) as EventListener

    // ── pointerleave ─────────────────────────────────────────────────────
    // Safety net: if the pointer somehow leaves the canvas element without
    // generating pointerup (happens on Safari under certain conditions),
    // we end the stroke gracefully.
    this.boundListeners.pointerleave = ((e: PointerEvent) => {
      if (e.pointerType !== 'pen') return
      if (e.pointerId !== this.activePenPointerId) return
      if (this.mode !== 'drawing-pen' && this.mode !== 'erasing') return

      if (DEBUG_PENCIL) {
        console.log(`[PENCIL] ← leave id=${e.pointerId} mode=${this.mode} – ending stroke`)
      }
      this.endPenStroke()
    }) as EventListener

    this.canvas.addEventListener('pointerdown', this.boundListeners.pointerdown)
    this.canvas.addEventListener('pointermove', this.boundListeners.pointermove)
    this.canvas.addEventListener('pointerup', this.boundListeners.pointerup)
    this.canvas.addEventListener('pointercancel', this.boundListeners.pointercancel)
    this.canvas.addEventListener('pointerleave', this.boundListeners.pointerleave)
  }

  // ─────────────────────────────────────────────
  // Touch Events (pinch-zoom)
  // ─────────────────────────────────────────────

  private setupTouchEvents() {
    this.boundListeners.touchstart = ((e: TouchEvent) => {
      if (e.touches.length === 2) {
        this.initialPinchDist = this.getPinchDistance(e.touches)
        this.initialZoom = this.transform.zoom
        const rect = this.canvas.getBoundingClientRect()
        this.lastMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        this.lastMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
        e.preventDefault()
      }
    }) as EventListener

    this.boundListeners.touchmove = ((e: TouchEvent) => {
      if (e.touches.length === 2 && this.initialPinchDist !== null) {
        const currentDist = this.getPinchDistance(e.touches)
        const rawScale = currentDist / this.initialPinchDist
        const clampedScale = Math.min(Math.max(rawScale, 0.9), 1.1)
        const newZoom = this.initialZoom * clampedScale

        const rect = this.canvas.getBoundingClientRect()
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top

        this.config.onZoom(newZoom, midX, midY)
        this.config.onPan((midX - this.lastMidX) * 0.7, (midY - this.lastMidY) * 0.7)
        this.lastMidX = midX
        this.lastMidY = midY
        e.preventDefault()
      }
    }) as EventListener

    this.boundListeners.touchend = ((e: TouchEvent) => {
      if (e.touches.length < 2) this.initialPinchDist = null
    }) as EventListener

    this.boundListeners.wheel = ((e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY > 0 ? 0.95 : 1.05
        const rect = this.canvas.getBoundingClientRect()
        this.config.onZoom(this.transform.zoom * factor, e.clientX - rect.left, e.clientY - rect.top)
      } else {
        this.config.onScroll(e.deltaY * 0.6)
      }
    }) as EventListener

    this.canvas.addEventListener('touchstart', this.boundListeners.touchstart, { passive: false })
    this.canvas.addEventListener('touchmove', this.boundListeners.touchmove, { passive: false })
    this.canvas.addEventListener('touchend', this.boundListeners.touchend)
    this.canvas.addEventListener('wheel', this.boundListeners.wheel, { passive: false })
  }

  // ─────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────

  public destroy() {
    this.canvas.removeEventListener('pointerdown', this.boundListeners.pointerdown)
    this.canvas.removeEventListener('pointermove', this.boundListeners.pointermove)
    this.canvas.removeEventListener('pointerup', this.boundListeners.pointerup)
    this.canvas.removeEventListener('pointercancel', this.boundListeners.pointercancel)
    this.canvas.removeEventListener('pointerleave', this.boundListeners.pointerleave)
    this.canvas.removeEventListener('touchstart', this.boundListeners.touchstart)
    this.canvas.removeEventListener('touchmove', this.boundListeners.touchmove)
    this.canvas.removeEventListener('touchend', this.boundListeners.touchend)
    this.canvas.removeEventListener('wheel', this.boundListeners.wheel)
  }

  // ─────────────────────────────────────────────
  // Misc helpers
  // ─────────────────────────────────────────────

  private getPinchDistance(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  private handleEraserMove(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const w = this.transform.screenToWorld(sx, sy)
    this.config.onEraserMove(w.x, w.y, sx, sy)
  }
}
