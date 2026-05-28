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

      if (e.pointerType === 'touch') {
        this.activeTouchCount++
        if (this.penIsOnScreen) return
        
        if (this.activeTouchCount > 1) {
          if (this.mode === 'drawing-finger') {
            this.config.onStrokeEnd()
          }
          this.mode = this.activeTouchCount === 2 ? 'zooming' : 'idle'
          return
        }

        // Single finger
        if (this.config.getActiveTool() === 'eraser') {
          this.mode = 'erasing'
          this.canvas.setPointerCapture(e.pointerId)
          this.handleEraserMove(e)
        } else {
          this.mode = 'drawing-finger'
          this.canvas.setPointerCapture(e.pointerId)
          this.config.onStrokeStart(e, true)
        }
      }

      if (e.pointerType === 'mouse') {
        this.canvas.setPointerCapture(e.pointerId)
        if (this.config.getActiveTool() === 'eraser') {
          this.mode = 'erasing'
          this.handleEraserMove(e)
        } else {
          this.mode = 'drawing-pen' // treat mouse as pen for drawing
          this.config.onStrokeStart(e, false)
        }
      }
    })

    this.canvas.addEventListener('pointermove', (e) => {
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
          const rect = this.canvas.getBoundingClientRect()
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
      if (e.touches.length === 2) {
        this.initialPinchDist = this.getPinchDistance(e.touches)
        this.initialZoom = this.transform.zoom
        const rect = this.canvas.getBoundingClientRect()
        this.lastMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        this.lastMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
        e.preventDefault()
      }
    }, { passive: false })

    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && this.initialPinchDist !== null) {
        const currentDist = this.getPinchDistance(e.touches)
        const scale = currentDist / this.initialPinchDist
        const newZoom = this.initialZoom * scale
        
        const rect = this.canvas.getBoundingClientRect()
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
        
        // Handle Zoom
        this.config.onZoom(newZoom, midX, midY)
        
        // Handle Pan
        const dx = midX - this.lastMidX
        const dy = midY - this.lastMidY
        this.config.onPan(dx, dy)
        
        this.lastMidX = midX
        this.lastMidY = midY
        
        e.preventDefault()
      } else if (e.touches.length === 1 && this.mode === 'idle') {
        // Scrolling? We handle that via wheel mostly, but for touch one finger scroll:
        // Actually the prompt says one finger drag = scroll (vertical)
        // But one finger is also drawing. 
        // "No stylus on screen -> one finger draws, two fingers scroll/zoom"
        // Wait, "One finger drag = scroll (vertical only on the page)"
        // "One finger, no pen -> Draws with simulated pressure"
        // This is a contradiction in the user request. 
        // "Summary of Input Rules (Final State): One finger, no pen -> Draws with simulated pressure"
        // I will follow the Final State summary.
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
        // Zoom toward the mouse cursor position
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
        const newZoom = Math.min(Math.max(this.transform.zoom * zoomFactor, 0.2), 5.0)
        
        const rect = this.canvas.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top
        
        this.config.onZoom(newZoom, mouseX, mouseY)
      } else {
        // Regular scroll — move vertically only (invert delta as per user requirement)
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
