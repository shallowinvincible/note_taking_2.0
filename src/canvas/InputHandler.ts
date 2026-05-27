import type { Point, StrokeTool } from '@/types/stroke'
import type { TransformSystem } from './TransformSystem'

export type StrokeCompleteCallback = (points: Point[], tool: StrokeTool) => void
export type RenderRequestCallback = () => void
export type PanCallback = (dx: number, dy: number) => void
export type ZoomCallback = (delta: number, cx: number, cy: number) => void

interface InputHandlerConfig {
  transform: TransformSystem
  getActiveTool: () => StrokeTool
  onStrokeComplete: StrokeCompleteCallback
  onRenderRequest: RenderRequestCallback
  onPan: PanCallback
  onZoom: ZoomCallback
  getCurrentPoints: () => Point[]
  setCurrentPoints: (pts: Point[]) => void
}

/**
 * InputHandler — registers Pointer Events on a canvas element.
 *
 * Palm rejection rules (matching Apple Pencil + S Pen behaviour):
 *   • pointerType === 'pen'   → always draw, set isPenActive
 *   • pointerType === 'touch' → draw ONLY if !isPenActive (finger pan allowed)
 *   • pointerType === 'mouse' → always draw
 *
 * Critically: no async code anywhere in this file.
 * Every point is converted to world coordinates before storage.
 */
export class InputHandler {
  private canvas: HTMLCanvasElement | null = null
  private config: InputHandlerConfig

  // Palm rejection state
  private isPenActive = false
  private activePointerId: number | null = null

  // Two-finger pan state
  private panPointers = new Map<number, { x: number; y: number }>()

  // Bound handlers (stored so removeEventListener works)
  private _onPointerDown: (e: PointerEvent) => void
  private _onPointerMove: (e: PointerEvent) => void
  private _onPointerUp: (e: PointerEvent) => void
  private _onPointerCancel: (e: PointerEvent) => void
  private _onWheel: (e: WheelEvent) => void

  constructor(config: InputHandlerConfig) {
    this.config = config

    this._onPointerDown = this.onPointerDown.bind(this)
    this._onPointerMove = this.onPointerMove.bind(this)
    this._onPointerUp = this.onPointerUp.bind(this)
    this._onPointerCancel = this.onPointerCancel.bind(this)
    this._onWheel = this.onWheel.bind(this)
  }

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
    canvas.addEventListener('pointerdown', this._onPointerDown)
    canvas.addEventListener('pointermove', this._onPointerMove)
    canvas.addEventListener('pointerup', this._onPointerUp)
    canvas.addEventListener('pointercancel', this._onPointerCancel)
    canvas.addEventListener('wheel', this._onWheel, { passive: false })
  }

  detach(): void {
    if (!this.canvas) return
    this.canvas.removeEventListener('pointerdown', this._onPointerDown)
    this.canvas.removeEventListener('pointermove', this._onPointerMove)
    this.canvas.removeEventListener('pointerup', this._onPointerUp)
    this.canvas.removeEventListener('pointercancel', this._onPointerCancel)
    this.canvas.removeEventListener('wheel', this._onWheel)
    this.canvas = null
  }

  // ─── Internal helpers ────────────────────────────────────────────────────

  private isDrawPointer(e: PointerEvent): boolean {
    if (e.pointerType === 'pen') return true
    if (e.pointerType === 'mouse') return true
    // touch only draws when no pen is active (palm rejection)
    if (e.pointerType === 'touch') return !this.isPenActive
    return false
  }

  private toWorldPoint(e: PointerEvent): Point {
    const rect = this.canvas!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const { x, y } = this.config.transform.screenToWorld(sx, sy)
    // Clamp pressure: Apple Pencil gives 0–1, mouse gives 0.5, touch gives 0
    const pressure = e.pressure > 0 ? e.pressure : 0.5
    return { x, y, pressure }
  }

  // ─── Pointer Down ────────────────────────────────────────────────────────

  private onPointerDown(e: PointerEvent): void {
    if (!this.canvas) return

    // Track pen active state for palm rejection
    if (e.pointerType === 'pen') {
      this.isPenActive = true
      // Cancel any ongoing touch pan when pen touches
      this.panPointers.clear()
    }

    // Two-finger touch pan
    if (e.pointerType === 'touch' && this.isPenActive) {
      // palm — ignore
      return
    }

    if (e.pointerType === 'touch' && !this.isPenActive) {
      this.panPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      this.canvas.setPointerCapture(e.pointerId)
      return
    }

    // Drawing pointer (pen or mouse)
    if (this.activePointerId !== null) return // already drawing
    if (!this.isDrawPointer(e)) return

    this.activePointerId = e.pointerId
    this.canvas.setPointerCapture(e.pointerId)

    const point = this.toWorldPoint(e)
    this.config.setCurrentPoints([point])
    this.config.onRenderRequest()
  }

  // ─── Pointer Move ────────────────────────────────────────────────────────
  // CRITICAL: no async code here, ever.

  private onPointerMove(e: PointerEvent): void {
    if (!this.canvas) return

    // Palm rejection — ignore touch movement while pen is active
    if (e.pointerType === 'touch' && this.isPenActive) return

    // Two-finger pan
    if (e.pointerType === 'touch' && this.panPointers.has(e.pointerId)) {
      const prev = this.panPointers.get(e.pointerId)!
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y

      if (this.panPointers.size === 1) {
        // Single-finger pan
        this.config.onPan(dx, dy)
      }

      this.panPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      this.config.onRenderRequest()
      return
    }

    // Active drawing stroke
    if (e.pointerId !== this.activePointerId) return

    const point = this.toWorldPoint(e)

    // Use getCoalescedEvents if available for sub-frame precision (Apple Pencil 120Hz)
    if (typeof e.getCoalescedEvents === 'function') {
      const coalesced = e.getCoalescedEvents()
      if (coalesced.length > 1) {
        const pts = coalesced.map((ce) => this.toWorldPoint(ce))
        const current = this.config.getCurrentPoints()
        this.config.setCurrentPoints([...current, ...pts])
        this.config.onRenderRequest()
        return
      }
    }

    const current = this.config.getCurrentPoints()
    this.config.setCurrentPoints([...current, point])
    this.config.onRenderRequest()
  }

  // ─── Pointer Up ──────────────────────────────────────────────────────────

  private onPointerUp(e: PointerEvent): void {
    // Pen lifted — clear pen active after a tiny delay so palm events
    // that arrive right after pen-up are still rejected.
    if (e.pointerType === 'pen') {
      // Use rAF instead of setTimeout per the rules
      requestAnimationFrame(() => {
        this.isPenActive = false
      })
    }

    // Touch pan release
    if (e.pointerType === 'touch') {
      this.panPointers.delete(e.pointerId)
      return
    }

    if (e.pointerId !== this.activePointerId) return

    this.activePointerId = null
    const points = this.config.getCurrentPoints()

    if (points.length > 0) {
      this.config.onStrokeComplete(points, this.config.getActiveTool())
    }

    this.config.setCurrentPoints([])
  }

  // ─── Pointer Cancel ──────────────────────────────────────────────────────

  private onPointerCancel(e: PointerEvent): void {
    if (e.pointerType === 'pen') {
      this.isPenActive = false
    }

    this.panPointers.delete(e.pointerId)

    if (e.pointerId === this.activePointerId) {
      this.activePointerId = null
      // Discard — do not commit partial stroke on cancel
      this.config.setCurrentPoints([])
      this.config.onRenderRequest()
    }
  }

  // ─── Wheel (scroll-to-zoom) ───────────────────────────────────────────────

  private onWheel(e: WheelEvent): void {
    e.preventDefault()
    if (!this.canvas) return

    const rect = this.canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top

    if (e.ctrlKey || e.metaKey) {
      // Pinch-zoom gesture (trackpad) or Ctrl+wheel
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      this.config.onZoom(factor, cx, cy)
    } else {
      // Scroll pan
      this.config.onPan(-e.deltaX, -e.deltaY)
    }

    this.config.onRenderRequest()
  }
}
