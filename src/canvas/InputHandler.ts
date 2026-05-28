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
}

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

  constructor(config: InputHandlerConfig) {
    this.canvas = config.canvas
    this.transform = config.transform
    this.config = config

    this.setupPointerEvents()
    this.setupTouchEvents()
  }

  private setupPointerEvents() {
    this.canvas.addEventListener('pointerdown', (e) => {
      // Clear multi-touch count if things got stuck
      if (this.activeTouchCount < 0) this.activeTouchCount = 0

      // Pen always takes precedence
      if (e.pointerType === 'pen') {
        this.penIsOnScreen = true
        this.canvas.setPointerCapture(e.pointerId)
        
        if (this.config.getActiveTool() === 'eraser') {
          this.mode = 'erasing'
          this.handleEraserMove(e)
        } else {
          this.mode = 'drawing-pen'
          this.config.onStrokeStart(e, false)
        }
        return
      }

      // Touch handling
      if (e.pointerType === 'touch') {
        this.activeTouchCount++
        
        // Palm Rejection: If pen is on screen, ignore all touches
        if (this.penIsOnScreen) return

        if (this.activeTouchCount > 1) {
          // Cancel drawing if it was a finger drawing
          if (this.mode === 'drawing-finger') this.config.onStrokeEnd()
          this.mode = this.activeTouchCount === 2 ? 'zooming' : 'idle'
          return
        }

        // Single finger behavior
        const inputMode = this.config.getInputMode()
        if (inputMode === 'finger') {
           if (this.config.getActiveTool() === 'eraser') {
             this.mode = 'erasing'
             this.canvas.setPointerCapture(e.pointerId)
             this.handleEraserMove(e)
           } else {
             this.mode = 'drawing-finger'
             this.canvas.setPointerCapture(e.pointerId)
             this.config.onStrokeStart(e, true)
           }
        } else {
          // Stylus mode: ignore single finger for drawing
          this.mode = 'idle'
        }
      }

      // Mouse handling
      if (e.pointerType === 'mouse') {
        this.canvas.setPointerCapture(e.pointerId)
        if (this.config.getActiveTool() === 'eraser') {
          this.mode = 'erasing'
          this.handleEraserMove(e)
        } else {
          this.mode = 'drawing-pen' 
          this.config.onStrokeStart(e, false)
        }
      }
    })

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.mode === 'idle') return

      const rect = this.canvas.getBoundingClientRect()

      if (this.mode === 'erasing') {
        if (e.pointerType === 'touch' && this.penIsOnScreen) return
        this.handleEraserMove(e)
        return
      }

      if (this.mode === 'drawing-pen' || this.mode === 'drawing-finger') {
        if (e.pointerType === 'touch' && this.penIsOnScreen) return
        
        // HIGH FIDELITY: Use coalesced events to get all points between frames
        const events = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [e]
        const points: Point[] = []
        
        for (const ev of events) {
          const world = this.transform.screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top)
          points.push({
            x: world.x,
            y: world.y,
            pressure: ev.pressure || 0.5
          })
        }
        this.config.onStrokeMove(points)
      }
    })

    const handleUp = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        this.penIsOnScreen = false
        if (this.mode === 'drawing-pen' || this.mode === 'erasing') {
          this.finishInput()
        }
        return
      }

      if (e.pointerType === 'touch') {
        this.activeTouchCount = Math.max(0, this.activeTouchCount - 1)
        if (this.mode === 'drawing-finger' || (this.mode === 'erasing' && this.activeTouchCount === 0)) {
          this.finishInput()
        }
        if (this.activeTouchCount === 0) this.mode = 'idle'
      }

      if (e.pointerType === 'mouse') {
        this.finishInput()
      }
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
        const scale = currentDist / this.initialPinchDist
        const newZoom = this.initialZoom * scale
        
        const rect = this.canvas.getBoundingClientRect()
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
        
        this.config.onZoom(newZoom, midX, midY)
        this.config.onPan(midX - this.lastMidX, midY - this.lastMidY)
        
        this.lastMidX = midX
        this.lastMidY = midY
        e.preventDefault()
      }
    }, { passive: false })

    this.canvas.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        this.initialPinchDist = null
      }
    })

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
        const rect = this.canvas.getBoundingClientRect()
        this.config.onZoom(this.transform.zoom * zoomFactor, e.clientX - rect.left, e.clientY - rect.top)
      } else {
        this.config.onScroll(e.deltaY)
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
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const world = this.transform.screenToWorld(screenX, screenY)
    this.config.onEraserMove(world.x, world.y, screenX, screenY)
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
