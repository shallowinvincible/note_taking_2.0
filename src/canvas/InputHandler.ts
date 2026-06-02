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

  private mode: InputMode = 'idle'
  private activePenPointerId: number | null = null
  private activeTouchCount = 0

  private initialPinchDist: number | null = null
  private initialZoom: number = 1
  private lastMidX = 0
  private lastMidY = 0
  private lastTouchX = 0
  private lastTouchY = 0

  private lastAddedPoint: Point | null = null
  public lastPointerEvent: PointerEvent | null = null

  // We track listeners separately by target so we can clean them up
  private canvasListeners: Record<string, EventListenerOrEventListenerObject> = {}
  private documentListeners: Record<string, { fn: EventListenerOrEventListenerObject; options?: AddEventListenerOptions }> = {}

  constructor(config: InputHandlerConfig) {
    this.canvas = config.canvas
    this.transform = config.transform
    this.config = config

    // touch-action: none must be on ALL layers including parent
    this.canvas.style.touchAction = 'none'

    this.setupPointerEvents()
    this.setupTouchEvents()
  }

  public updateConfig(newConfig: InputHandlerConfig) {
    this.config = newConfig
    this.transform = newConfig.transform
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

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

  /** Returns world coords from a client-space position */
  private clientToWorld(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect()
    return this.transform.screenToWorld(clientX - rect.left, clientY - rect.top)
  }

  /** Check that the clientX/Y is within the canvas bounding rect */
  private isOverCanvas(clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect()
    return clientX >= rect.left && clientX <= rect.right &&
      clientY >= rect.top && clientY <= rect.bottom
  }

  // ─── Stroke lifecycle ────────────────────────────────────────────────────────

  private beginPenStroke(e: PointerEvent) {
    // Always clear prior state — safety net for rapid strokes
    if (this.mode !== 'idle') {
      if (DEBUG_PENCIL) console.warn(`[PENCIL] beginPenStroke: force-ending mode=${this.mode}`)
      this._resetMode()
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
   * End pen stroke.
   * HARD RESET FIRST: mode → idle, pointerId → null
   * Callbacks fire AFTER state has been cleared so the next pointerdown
   * can start a new stroke immediately (even inside the microtask queue).
   */
  private endPenStroke() {
    const prevMode = this.mode
    // ─── STATE RESET: happens synchronously, before ANY callback ────────
    this.mode = 'idle'
    this.activePenPointerId = null
    // ────────────────────────────────────────────────────────────────────

    if (prevMode === 'drawing-pen' || prevMode === 'drawing-finger') {
      this.config.onStrokeEnd()
    } else if (prevMode === 'erasing') {
      this.config.onEraserEnd()
    }
  }

  private _resetMode() {
    const prev = this.mode
    this.mode = 'idle'
    this.activePenPointerId = null
    if (prev === 'drawing-pen' || prev === 'drawing-finger') this.config.onStrokeEnd()
    else if (prev === 'erasing') this.config.onEraserEnd()
  }

  // ─── Pointer Events ──────────────────────────────────────────────────────────

  private setupPointerEvents() {

    // ── pointerdown ──────────────────────────────────────────────────────────
    //
    // KEY FIX: Listen on DOCUMENT with {capture: true}.
    //
    // On iPadOS, when writing rapidly, Apple Pencil tip coordinates can land
    // sub-pixel outside the canvas element's hit-test region between rapid
    // strokes. The event is dispatched to the document but never bubbles to
    // the canvas element listener — causing the stroke to be missed entirely.
    //
    // By listening at the document capture phase, we intercept ALL pointer
    // events first, then filter by canvas bounds ourselves.
    //
    // This is how Figma, Excalidraw, and GoodNotes-style web apps work.
    //
    const onPointerDown = (e: PointerEvent) => {
      this.lastPointerEvent = e

      if (e.pointerType === 'pen') {
        if (DEBUG_PENCIL) {
          console.log(`[PENCIL] ↓ down id=${e.pointerId} t=${e.timeStamp.toFixed(1)} mode=${this.mode} overCanvas=${this.isOverCanvas(e.clientX, e.clientY)}`)
        }

        // For pen: only require the event to be near the canvas,
        // not necessarily a perfect hit-test on the element.
        if (!this.isOverCanvas(e.clientX, e.clientY)) return

        const world = this.clientToWorld(e.clientX, e.clientY)
        if (!this.isInsidePage(world.x, world.y)) {
          if (DEBUG_PENCIL) console.warn('[PENCIL] outside page – ignored')
          return
        }

        // No setPointerCapture for pen — more reliable on Safari/iPadOS
        this.beginPenStroke(e)
        return
      }

      // Touch and mouse: only handle if the event targets the canvas or a child
      if (!this.isOverCanvas(e.clientX, e.clientY)) return

      if (e.pointerType === 'touch') {
        this.activeTouchCount++
        this.lastTouchX = e.clientX
        this.lastTouchY = e.clientY

        if (this.activeTouchCount > 1) {
          if (this.mode === 'drawing-finger') this.config.onStrokeEnd()
          this.mode = this.activeTouchCount === 2 ? 'zooming' : 'idle'
          return
        }

        const world = this.clientToWorld(e.clientX, e.clientY)
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
        const world = this.clientToWorld(e.clientX, e.clientY)
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
    }

    // ── pointermove ──────────────────────────────────────────────────────────
    // Also on document so coalesced Pencil events are never lost
    const onPointerMove = (e: PointerEvent) => {
      this.lastPointerEvent = e
      const rect = this.canvas.getBoundingClientRect()

      // Pen hover (pressure == 0 while idle) — not a drawing event
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
        if (e.pointerType === 'pen' && e.pointerId !== this.activePenPointerId) return
        this.handleEraserMove(e)
        return
      }

      if (this.mode === 'drawing-pen' || this.mode === 'drawing-finger') {
        if (e.pointerType === 'pen' && e.pointerId !== this.activePenPointerId) return

        const coalescedEvents: PointerEvent[] = (e as any).getCoalescedEvents?.() ?? [e]
        const points: Point[] = []

        for (const ev of coalescedEvents) {
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
    }

    // ── pointerup ────────────────────────────────────────────────────────────
    const onPointerUp = (e: PointerEvent) => {
      try {
        if (this.canvas.hasPointerCapture(e.pointerId)) {
          this.canvas.releasePointerCapture(e.pointerId)
        }
      } catch (_) {}

      if (DEBUG_PENCIL && e.pointerType === 'pen') {
        console.log(`[PENCIL] ↑ up   id=${e.pointerId} t=${e.timeStamp.toFixed(1)} mode=${this.mode}`)
      }

      if (e.pointerType === 'pen') {
        if (this.mode === 'drawing-pen' || this.mode === 'erasing') {
          this.endPenStroke()
        }
        return
      }

      if (e.pointerType === 'touch') {
        this.activeTouchCount = Math.max(0, this.activeTouchCount - 1)
        if (this.mode === 'drawing-finger' || this.mode === 'erasing' || this.mode === 'scrolling') {
          const prevMode = this.mode
          this.mode = 'idle'
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
    }

    // ── pointercancel ────────────────────────────────────────────────────────
    // Safari emits pointercancel instead of pointerup on many iPad interactions.
    // Treat it identically to pointerup — never discard the stroke.
    const onPointerCancel = (e: PointerEvent) => {
      try {
        if (this.canvas.hasPointerCapture(e.pointerId)) {
          this.canvas.releasePointerCapture(e.pointerId)
        }
      } catch (_) {}

      if (DEBUG_PENCIL && e.pointerType === 'pen') {
        console.log(`[PENCIL] ✕ cancel id=${e.pointerId} t=${e.timeStamp.toFixed(1)} mode=${this.mode}`)
      }

      if (e.pointerType === 'pen') {
        if (this.mode === 'drawing-pen' || this.mode === 'erasing') {
          this.endPenStroke()
        }
        return
      }

      if (e.pointerType === 'touch') {
        this.activeTouchCount = Math.max(0, this.activeTouchCount - 1)
      }
      this._resetMode()
    }

    // Register on DOCUMENT (capture phase) for pointerdown
    // Register on DOCUMENT (bubble phase) for move/up/cancel — pointer capture
    // ensures these route correctly even without element-level capture
    document.addEventListener('pointerdown', onPointerDown, { capture: true })
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerCancel)

    this.documentListeners['pointerdown'] = { fn: onPointerDown as EventListenerOrEventListenerObject, options: { capture: true } }
    this.documentListeners['pointermove'] = { fn: onPointerMove as EventListenerOrEventListenerObject }
    this.documentListeners['pointerup'] = { fn: onPointerUp as EventListenerOrEventListenerObject }
    this.documentListeners['pointercancel'] = { fn: onPointerCancel as EventListenerOrEventListenerObject }
  }

  // ─── Touch Events (pinch-zoom only) ─────────────────────────────────────────

  private setupTouchEvents() {
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        this.initialPinchDist = this.getPinchDistance(e.touches)
        this.initialZoom = this.transform.zoom
        const rect = this.canvas.getBoundingClientRect()
        this.lastMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        this.lastMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
        e.preventDefault()
      }
    }

    const onTouchMove = (e: TouchEvent) => {
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
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) this.initialPinchDist = null
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY > 0 ? 0.95 : 1.05
        const rect = this.canvas.getBoundingClientRect()
        this.config.onZoom(this.transform.zoom * factor, e.clientX - rect.left, e.clientY - rect.top)
      } else {
        this.config.onScroll(e.deltaY * 0.6)
      }
    }

    this.canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    this.canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    this.canvas.addEventListener('touchend', onTouchEnd)
    this.canvas.addEventListener('wheel', onWheel, { passive: false })

    this.canvasListeners['touchstart'] = onTouchStart as EventListenerOrEventListenerObject
    this.canvasListeners['touchmove'] = onTouchMove as EventListenerOrEventListenerObject
    this.canvasListeners['touchend'] = onTouchEnd as EventListenerOrEventListenerObject
    this.canvasListeners['wheel'] = onWheel as EventListenerOrEventListenerObject
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  public destroy() {
    for (const [type, { fn, options }] of Object.entries(this.documentListeners)) {
      document.removeEventListener(type, fn, options)
    }
    for (const [type, fn] of Object.entries(this.canvasListeners)) {
      this.canvas.removeEventListener(type, fn)
    }
    this.documentListeners = {}
    this.canvasListeners = {}
  }

  // ─── Misc ────────────────────────────────────────────────────────────────────

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
