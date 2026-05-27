import getStroke from 'perfect-freehand'
import type { Stroke } from '@/types/stroke'
import type { TransformSystem } from './TransformSystem'

/**
 * Converts a perfect-freehand outline into an SVG path string.
 * Uses quadratic Bézier curves through midpoints for smoothness.
 */
function getSvgPathFromStroke(points: number[][]): string {
  if (points.length < 2) return ''

  const d: (string | number)[] = ['M', points[0][0], points[0][1], 'Q']
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    d.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  d.push('Z')
  return d.join(' ')
}

/**
 * Render a single committed stroke onto a canvas context.
 * All world-coordinate points are converted to screen space via
 * the TransformSystem before rendering.
 */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  transform: TransformSystem
): void {
  if (stroke.points.length === 0) return

  // Convert world points → screen points for Perfect Freehand
  const inputPoints = stroke.points.map((p) => {
    const { x, y } = transform.worldToScreen(p.x, p.y)
    return [x, y, p.pressure]
  })

  const outlinePoints = getStroke(inputPoints, {
    size: stroke.width * transform.zoom,
    thinning: stroke.tool === 'eraser' ? 0 : 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: false, // we have real hardware pressure
    last: true,
  })

  if (outlinePoints.length === 0) return

  const pathStr = getSvgPathFromStroke(outlinePoints)
  const path = new Path2D(pathStr)

  if (stroke.tool === 'eraser') {
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = 'rgba(0,0,0,1)'
    ctx.fill(path)
    ctx.restore()
  } else {
    ctx.fillStyle = stroke.color
    ctx.fill(path)
  }
}

/**
 * Render the in-progress (active) stroke during a live drawing session.
 * Points are already in world coordinates; transform converts to screen.
 */
export function renderActiveStroke(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number; pressure: number }[],
  color: string,
  width: number,
  tool: 'pen' | 'eraser',
  transform: TransformSystem
): void {
  if (points.length === 0) return

  const inputPoints = points.map((p) => {
    const { x, y } = transform.worldToScreen(p.x, p.y)
    return [x, y, p.pressure]
  })

  const outlinePoints = getStroke(inputPoints, {
    size: width * transform.zoom,
    thinning: tool === 'eraser' ? 0 : 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: false,
    last: false,
  })

  if (outlinePoints.length === 0) return

  const pathStr = getSvgPathFromStroke(outlinePoints)
  const path = new Path2D(pathStr)

  if (tool === 'eraser') {
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = 'rgba(0,0,0,1)'
    ctx.fill(path)
    ctx.restore()
  } else {
    ctx.fillStyle = color
    ctx.fill(path)
  }
}

/**
 * Redraw all committed strokes onto the committed layer canvas.
 * Called on: page load, undo/redo, zoom/pan end.
 */
export function redrawCommittedLayer(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  transform: TransformSystem
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  for (const stroke of strokes) {
    renderStroke(ctx, stroke, transform)
  }
}
