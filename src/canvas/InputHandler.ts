import type { Point, StrokeTool } from '@/types/stroke'
import type { TransformSystem } from './TransformSystem'

export type InputMode = 'idle' | 'drawing-pen' | 'drawing-finger' | 'erasing' | 'scrolling' | 'zooming'

export interface InputHandlerConfig {
  canvas: HTMLCanvasElement
  transform: TransformSystem
  onStrokeStart: (e: PointerEvent, simulatePressure: boolean) => void
  onStrokeMove: (points: Point[]) => void
  onStrokeEnd: () => void
  onEraserMove: (worldX: number, worldY: number, screenX: number, screenY: number) => void
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
const MIN_POINT_DISTANCE = 1.5 // world units

export class InputHandler {
  private canvas: HTMLCanvasElement
  private transform: TransformSystem
  private config: InputHandlerConfig

  private mode: InputMode = 'idle'
  private activeTouchCount = 0
  private penIsOnScreen = false

  private initialPinchDist: number | null = null
  private initialZoom: number = 1
  private lastMidX = 0
  private lastMidY = 0
  
  public lastPointerEvent: PointerEvent | null = null

  constructor(config: InputHandlerConfig) {
    this.canvas = config.canvas
    this.transform = config.transform
    this.config = config

    this.setupPointerEvents()
    this.setupTouchEvents()
  }

  /** Check if a world point is inside the page boundary */
  private isInsidePage(wx: number, wy: number): boolean {
    return wx >= 0 && wx <= PAGE_WIDTH_WORLD && 
           wy >= 0 && wy <= this.config.getPageHeight()
  }

  /** Clamp a world point to the page boundary */
  private clampToPage(wx: number, wy: number): { x: number; y: number } {
    return {
      x: Math.min(Math.max(wx, 0), PAGE_WIDTH_WORLD),
      y: Math.min(Math.max(wy, 0), this.config.getPageHeight())
    }
  }

  /** Filter points by minimum distance to avoid artifacts */
  private lastAddedPoint: Point | null = null
  private shouldAddPoint(newX: number, newY: number): boolean {
    if (!this.lastAddedPoint) return true
    const dx = newX - this.lastAddedPoint.x
    const dy = newY - this.lastAddedPoint.y
    return Math.sqrt(dx * dx + dy * dy) >= MIN_POINT_DISTANCE
  }

  /** Determine pressure based on toggle and hardware capability */
  public getPointPressure(e: PointerEvent): number {
    if (!this.config.isPressureEnabled()) return 0.5
    // Fall back to 0.5 if pressure is explicitly 0 (initial contact)
    return e.pressure > 0 ? e.pressure : 0.5
  }

  private setupPointerEvents() {
    this.canvas.addEventListener('pointerdown', (e) => {
      this.lastPointerEvent = e
      const rect = this.canvas.getBoundingClientRect()
      const world = this.transform.screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
      
      // RESTRICTION: Block stroke start outside page
      if (!this.isInsidePage(world.x, world.y)) return

      if (e.pointerType === 'pen') {
        this.penIsOnScreen = true
        this.canvas.setPointerCapture(e.pointerId)
        
        if (this.config.getActiveTool() === 'eraser') {
          this.mode = 'erasing'
          this.handleEraserMove(e)
        } else {
          this.mode = 'drawing-pen'
          this.lastAddedPoint = null
          this.config.onStrokeStart(e, false)
        }
        return
      }

      if (e.pointerType === 'touch') {
        this.activeTouchCount++
        if (this.penIsOnScreen) return
        
        if (this.activeTouchCount > 1) {
          if (this.mode === 'drawing-finger') this.config.onStrokeEnd()
          this.mode = this.activeTouchCount === 2 ? 'zooming' : 'idle'
          return
        }

        if (this.config.getInputMode() === 'finger') {
          if (this.config.getActiveTool() === 'eraser') {
            this.mode = 'erasing'
          } else {
            this.mode = 'drawing-finger'
            this.lastAddedPoint = null
            this.config.onStrokeStart(e, true)
          }
          this.canvas.setPointerCapture(e.pointerId)
        }
      }

      if (e.pointerType === 'mouse') {
        this.canvas.setPointerCapture(e.pointerId)
        if (this.config.getActiveTool() === 'eraser') {
          this.mode = 'erasing'
          this.handleEraserMove(e)
        } else {
          this.mode = 'drawing-pen'
          this.lastAddedPoint = null
          this.config.onStrokeStart(e, false)
        }
      }
    })

    this.canvas.addEventListener('pointermove', (e) => {
      this.lastPointerEvent = e
      const rect = this.canvas.getBoundingClientRect()
      const world = this.transform.screenToWorld(e.clientX - rect.left, e.clientY - rect.top)

      // Update cursor style
      if (!this.isInsidePage(world.x, world.y)) {
        this.canvas.style.cursor = 'not-allowed'
      } else {
        this.canvas.style.cursor = 'none'
      }

      if (this.mode === 'idle') return

      if (this.mode === 'erasing') {
        if (e.pointerType === 'touch' && this.penIsOnScreen) return
        this.handleEraserMove(e)
        return
      }

      if (this.mode === 'drawing-pen' || this.mode === 'drawing-finger') {
        if (e.pointerType === 'touch' && this.penIsOnScreen) return
        
        const events = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [e]
        const points: Point[] = []
        
        for (const ev of events) {
          const w = this.transform.screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top)
          const clamped = this.clampToPage(w.x, w.y)
          
          if (this.shouldAddPoint(clamped.x, clamped.y)) {
            const p = {
              x: clamped.x,
              y: clamped.y,
              pressure: this.getPointPressure(ev)
            }
            points.push(p)
            this.lastAddedPoint = p
          }
        }
        if (points.length > 0) this.config.onStrokeMove(points)
      }
    })

    const handleUp = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        this.penIsOnScreen = false
        if (this.mode === 'drawing-pen' || this.mode === 'erasing') this.finishInput()
        return
      }

      if (e.pointerType === 'touch') {
        this.activeTouchCount = Math.max(0, this.activeTouchCount - 1)
        if (this.mode === 'drawing-finger' || (this.mode === 'erasing' && this.activeTouchCount === 0)) {
          this.finishInput()
        }
        if (this.activeTouchCount === 0) this.mode = 'idle'
      }

      if (e.pointerType === 'mouse') this.finishInput()
    }

    this.canvas.addEventListener('pointerup', handleUp)
    this.canvas.addEventListener('pointercancel', (e) => {
      if (e.pointerType === 'pen') this.penIsOnScreen = false
      if (e.pointerType === 'touch') this.activeTouchCount = Math.max(0, this.activeTouchCount - 1)
      this.finishInput()
    })
  }

  private setupTouchEvents() {
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2 && !this.penIsOnScreen) {
        this.initialPinchDist = this.getPinchDistance(e.touches)
        this.initialZoom = this.transform.zoom
        const rect = this.canvas.getBoundingClientRect()
        this.lastMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        this.lastMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
        e.preventDefault()
      }
    }, { passive: false })

    this.canvas.addEventListener('touchmove', (e) => {
      if (this.penIsOnScreen) return

      if (e.touches.length === 2 && this.initialPinchDist !== null) {
        const currentDist = this.getPinchDistance(e.touches)
        const rawScale = currentDist / this.initialPinchDist
        // DAMPING: Limit zoom change per frame to 10%
        const clampedScale = Math.min(Math.max(rawScale, 0.9), 1.1)
        const newZoom = this.initialZoom * clampedScale
        
        const rect = this.canvas.getBoundingClientRect()
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
        
        this.config.onZoom(newZoom, midX, midY)
        
        // DAMPING: Apply 0.7 dampening to pan
        const panDamping = 0.7
        this.config.onPan((midX - this.lastMidX) * panDamping, (midY - this.lastMidY) * panDamping)
        
        this.lastMidX = midX
        this.lastMidY = midY
        e.preventDefault()
      }
    }, { passive: false })

    this.canvas.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) this.initialPinchDist = null
    })

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        // DAMPING: Reduce zoom sensitivity (0.95/1.05)
        const zoomFactor = e.deltaY > 0 ? 0.95 : 1.05
        const rect = this.canvas.getBoundingClientRect()
        this.config.onZoom(this.transform.zoom * zoomFactor, e.clientX - rect.left, e.clientY - rect.top)
      } else {
        // DAMPING: Reduce scroll sensitivity by 40% (0.6 multiplier)
        const scrollDampening = 0.6
        this.config.onScroll(e.deltaY * scrollDampening)
      }
    }, { passive: false })
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

  private finishInput() {
    if (this.mode === 'erasing') {
      this.config.onEraserEnd()
    } else if (this.mode === 'drawing-pen' || this.mode === 'drawing-finger') {
      this.config.onStrokeEnd()
    }
    this.mode = 'idle'
  }
}
