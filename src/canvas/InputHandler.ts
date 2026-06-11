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

const DEBUG_PENCIL = false

export class InputHandler {
  private canvas: HTMLCanvasElement
  private transform: TransformSystem
  private config: InputHandlerConfig

  private mode: InputMode = 'idle'
  private activePenPointerId: number | null = null
  // timeStamp of the active pen stroke's pointerdown. Used to reject stale
  // pen events delivered out of order during fast successive strokes on iPad.
  private activePenDownTime = 0
  private activeTouchCount = 0

  private initialPinchDist: number | null = null
  private initialZoom: number = 1
  private lastMidX = 0
  private lastMidY = 0
  private lastTouchX = 0
  private lastTouchY = 0

  private lastAddedPoint: Point | null = null
  public lastPointerEvent: PointerEvent | null = null

  private canvasListeners: Record<string, EventListenerOrEventListenerObject> = {}
  private documentListeners: Record<string, { fn: EventListenerOrEventListenerObject; options?: AddEventListenerOptions }> = {}

  constructor(config: InputHandlerConfig) {
    this.canvas = config.canvas
    this.transform = config.transform
    this.config = config
    if (!this.canvas) return
    this.canvas.style.touchAction = 'none'
    this.setupPointerEvents()
    this.setupTouchEvents()
  }

  public updateConfig(newConfig: InputHandlerConfig) {
    this.config = newConfig
    this.transform = newConfig.transform
  }

  // --- Helpers ---

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

  /**
   * True if this pen event does not belong to the currently-active stroke.
   * iPad Safari can deliver events out of order during fast lift+retouch
   * (down2 before up1) and often reuses the same pointerId for every Pencil
   * stroke, so a pointerId check alone is not enough — we also reject any
   * event whose timeStamp predates the active stroke's pointerdown.
   */
  private isStalePenEvent(e: PointerEvent): boolean {
    if (this.activePenPointerId === null) return false
    if (e.pointerId !== this.activePenPointerId) return true
    if (e.timeStamp < this.activePenDownTime) return true
    return false
  }

  public getPointPressure(e: PointerEvent): number {
    if (!this.config.isPressureEnabled()) return 0.5
    return e.pressure > 0 ? e.pressure : 0.5
  }

  /**
   * Extract drawable points from a pointer event (including any high-frequency
   * coalesced samples) and feed them to the active stroke.
   *
   * Used on pointerdown (seed the initial touch point), pointermove, AND
   * pointerup. Reading coalesced events on pointerup matters because a fast
   * Apple Pencil flick can fire pointerdown -> pointerup with NO pointermove
   * in between — the movement only arrives bundled in the up event. Without
   * this, such fast strokes collect <2 points and get dropped at commit.
   */
  private addStrokePoints(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect()
    const coalesced = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : null
    const events: PointerEvent[] = coalesced && coalesced.length ? coalesced : [e]

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

  private isOverCanvas(clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect()
    // Add 1px padding for sub-pixel misses on iPad
    return clientX >= rect.left - 1 && clientX <= rect.right + 1 &&
      clientY >= rect.top - 1 && clientY <= rect.bottom + 1
  }

  private clientToWorld(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect()
    return this.transform.screenToWorld(clientX - rect.left, clientY - rect.top)
  }

  // --- Stroke Lifecycle ---

  private beginPenStroke(e: PointerEvent) {
    if (this.mode !== 'idle') {
      if (DEBUG_PENCIL) console.warn(`[PENCIL] Force finishing previous mode: ${this.mode}`);
      this.finishInput();
    }

    this.activePenPointerId = e.pointerId
    this.activePenDownTime = e.timeStamp
    this.lastAddedPoint = null

    if (this.config.getActiveTool() === 'eraser') {
      this.mode = 'erasing'
      this.config.onEraserStart()
      this.handleEraserMove(e)
    } else {
      this.mode = 'drawing-pen'
      this.config.onStrokeStart(e, false)
      // Seed the touch-down point so the stroke always starts with a real
      // sample, even if the first pointermove is late or never arrives.
      this.addStrokePoints(e)
    }
  }

  private finishInput() {
    const prevMode = this.mode
    this.mode = 'idle'
    this.activePenPointerId = null

    if (prevMode === 'erasing') {
      this.config.onEraserEnd()
    } else if (prevMode === 'drawing-pen' || prevMode === 'drawing-finger') {
      this.config.onStrokeEnd()
    }
  }

  // --- Pointer Events ---

  private setupPointerEvents() {
    const onPointerDown = (e: PointerEvent) => {
      // Only the drawing canvas starts canvas input. Any tap whose target is a
      // floating UI element (toolbar, header buttons, the pages sidebar, its
      // backdrop, etc.) is left alone so the button actually receives the tap.
      // This is more robust than enumerating element ids and is what makes the
      // back / undo / page buttons work on touch devices, where the canvas used
      // to steal the touch via setPointerCapture/preventDefault.
      if (e.target !== this.canvas) return

      this.lastPointerEvent = e

      if (e.pointerType === 'pen') {
        if (DEBUG_PENCIL) console.log(`[PENCIL] ↓ down id=${e.pointerId} mode=${this.mode}`);

        // Use coordinates to determine if it should be a stroke
        if (!this.isOverCanvas(e.clientX, e.clientY)) return

        const world = this.clientToWorld(e.clientX, e.clientY)
        if (!this.isInsidePage(world.x, world.y)) return

        this.beginPenStroke(e)
        // Prevent default to avoid selection/scrolling in some browsers
        if (e.cancelable) e.preventDefault()
        return
      }

      // Finger/Mouse: Only proceed if it actually hit the canvas
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

        const inputMode = this.config.getInputMode()
        if (inputMode === 'finger') {
          const world = this.clientToWorld(e.clientX, e.clientY)
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

    const onPointerMove = (e: PointerEvent) => {
      if (this.mode === 'idle') return

      if (this.mode === 'scrolling' && e.pointerType === 'touch') {
        const dx = e.clientX - this.lastTouchX
        const dy = e.clientY - this.lastTouchY
        // 1:1 finger tracking — the page follows the finger exactly, which is
        // what feels natural. The old 0.6 damping made scrolling feel sluggish.
        this.config.onPan(dx, dy)
        this.lastTouchX = e.clientX
        this.lastTouchY = e.clientY
        return
      }

      if (this.mode === 'erasing') {
        if (e.pointerType === 'pen' && this.isStalePenEvent(e)) return
        this.handleEraserMove(e)
        return
      }

      if (this.mode === 'drawing-pen' || this.mode === 'drawing-finger') {
        if (e.pointerType === 'pen' && this.isStalePenEvent(e)) return
        this.addStrokePoints(e)
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      try {
        if (this.canvas.hasPointerCapture(e.pointerId)) {
          this.canvas.releasePointerCapture(e.pointerId)
        }
      } catch (_) { }

      if (e.pointerType === 'pen') {
        if (DEBUG_PENCIL) console.log(`[PENCIL] ↑ up id=${e.pointerId} mode=${this.mode}`);
        // A stale pointerup from the previous stroke (delivered out of order
        // during fast writing) must NOT finish the newly started stroke, or
        // that new stroke is silently dropped and its moves ignored (mode=idle).
        if (this.isStalePenEvent(e)) return
        if (this.mode === 'drawing-pen') {
          // Capture any movement that only arrived bundled in the up event
          // (fast flicks fire down -> up with no intermediate pointermove).
          this.addStrokePoints(e)
          this.finishInput()
        } else if (this.mode === 'erasing') {
          this.finishInput()
        }
        return
      }

      if (e.pointerType === 'touch') {
        this.activeTouchCount = Math.max(0, this.activeTouchCount - 1)
        if (this.activeTouchCount === 0 || this.mode !== 'zooming') {
          this.finishInput()
        }
        return
      }

      if (e.pointerType === 'mouse') {
        this.finishInput()
      }
    }

    const onPointerCancel = (e: PointerEvent) => {
      try {
        if (this.canvas.hasPointerCapture(e.pointerId)) {
          this.canvas.releasePointerCapture(e.pointerId)
        }
      } catch (_) { }

      // Same out-of-order guard as pointerup: a stale cancel from a previous
      // pen stroke must not tear down the stroke that is currently active.
      if (e.pointerType === 'pen' && this.isStalePenEvent(e)) return

      if (e.pointerType === 'touch') {
        this.activeTouchCount = Math.max(0, this.activeTouchCount - 1)
      }
      this.finishInput()
    }

    // DOCUMENT ATTACHMENT WITH CAPTURE
    document.addEventListener('pointerdown', onPointerDown, { capture: true })
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerCancel)

    this.documentListeners['pointerdown'] = { fn: onPointerDown as any, options: { capture: true } }
    this.documentListeners['pointermove'] = { fn: onPointerMove as any }
    this.documentListeners['pointerup'] = { fn: onPointerUp as any }
    this.documentListeners['pointercancel'] = { fn: onPointerCancel as any }
  }

  private setupTouchEvents() {
    const onTouchStart = (e: TouchEvent) => {
      // SCRIBBLE WORKAROUND (iPadOS 14+): With the system "Scribble" feature
      // enabled, Safari silently drops Apple Pencil PointerEvents during fast
      // successive strokes ("every other stroke goes missing"). The only known
      // fix is to have a NON-passive touch handler that calls preventDefault on
      // the drawing surface — this stops iPadOS from swallowing those events.
      // Pointer events still fire after this, so finger/pen drawing is intact.
      // Ref: https://mikepk.com/2020/10/iOS-safari-scribble-bug/
      if (e.cancelable) e.preventDefault()

      if (e.touches.length === 2) {
        this.initialPinchDist = this.getPinchDistance(e.touches)
        this.initialZoom = this.transform.zoom
        const rect = this.canvas.getBoundingClientRect()
        this.lastMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        this.lastMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      // Scribble workaround (see onTouchStart) — must preventDefault on every
      // touchmove, not just during pinch, or fast Pencil strokes get dropped.
      if (e.cancelable) e.preventDefault()

      if (e.touches.length === 2 && this.initialPinchDist !== null) {
        const currentDist = this.getPinchDistance(e.touches)
        // True pinch-to-zoom: scale is measured against the gesture's starting
        // spread, so the zoom tracks the fingers 1:1. The previous ±10%-per-frame
        // clamp made pinching feel stiff and unresponsive. Absolute zoom is still
        // bounded inside setZoomToward (0.2–5.0).
        const scale = currentDist / this.initialPinchDist
        const newZoom = this.initialZoom * scale

        const rect = this.canvas.getBoundingClientRect()
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top

        this.config.onZoom(newZoom, midX, midY)
        this.config.onPan(midX - this.lastMidX, midY - this.lastMidY)
        this.lastMidX = midX
        this.lastMidY = midY
      }
    }

    const onWheel = (e: WheelEvent) => {
      if (e.target === this.canvas) {
        e.preventDefault()
        if (e.ctrlKey || e.metaKey) {
          const factor = e.deltaY > 0 ? 0.95 : 1.05
          const rect = this.canvas.getBoundingClientRect()
          this.config.onZoom(this.transform.zoom * factor, e.clientX - rect.left, e.clientY - rect.top)
        } else {
          this.config.onScroll(e.deltaY)
        }
      }
    }

    this.canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    this.canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    this.canvas.addEventListener('wheel', onWheel, { passive: false })

    this.canvasListeners['touchstart'] = onTouchStart as any
    this.canvasListeners['touchmove'] = onTouchMove as any
    this.canvasListeners['wheel'] = onWheel as any

    // Document-level Scribble guard. The canvas listeners above only fire when
    // the canvas is the touch target; attaching the same preventDefault at the
    // document level guarantees the Scribble swallow-fix is active regardless
    // of stacking/hit-testing, while leaving the toolbar fully interactive.
    const onDocTouch = (e: TouchEvent) => {
      // Only swallow touches that land on the drawing canvas (the Scribble fix).
      // Touches on any floating UI must pass through untouched, otherwise their
      // tap/click is suppressed and buttons like Back / Pages stop working.
      if (e.target !== this.canvas) return
      if (e.cancelable) e.preventDefault()
    }
    document.addEventListener('touchstart', onDocTouch, { passive: false })
    document.addEventListener('touchmove', onDocTouch, { passive: false })
    this.documentListeners['touchstart'] = { fn: onDocTouch as any, options: { passive: false } }
    this.documentListeners['touchmove'] = { fn: onDocTouch as any, options: { passive: false } }
  }

  public destroy() {
    for (const [type, { fn, options }] of Object.entries(this.documentListeners)) {
      document.removeEventListener(type, fn, options)
    }
    for (const [type, fn] of Object.entries(this.canvasListeners)) {
      this.canvas.removeEventListener(type, fn)
    }
  }

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
