import getStroke from 'perfect-freehand'
import type { Stroke } from '@/types/stroke'
import type { TransformSystem } from './TransformSystem'

/** Convert perfect-freehand outline points to SVG path string */
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

/** Render a single committed stroke with opacity support */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  transform: TransformSystem,
  opacity: number = 1.0
): void {
  if (stroke.points.length === 0) return

  const inputPoints = stroke.points.map((p) => {
    const { x, y } = transform.worldToScreen(p.x, p.y)
    return [x, y, p.pressure]
  })

  const outlinePoints = getStroke(inputPoints, {
    size: stroke.width * transform.zoom,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: stroke.simulatePressure ?? false,
    last: true,
  })

  if (outlinePoints.length === 0) return

  const pathStr = getSvgPathFromStroke(outlinePoints)
  const path = new Path2D(pathStr)

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.fillStyle = stroke.color
  ctx.fill(path)
  ctx.restore()
}

/** Render the active (in-progress) stroke */
export function renderActiveStroke(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number; pressure: number }[],
  color: string,
  width: number,
  transform: TransformSystem,
  simulatePressure: boolean = false
): void {
  if (points.length < 2) return

  const inputPoints = points.map((p) => {
    const { x, y } = transform.worldToScreen(p.x, p.y)
    return [x, y, p.pressure]
  })

  const outlinePoints = getStroke(inputPoints, {
    size: width * transform.zoom,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: simulatePressure,
    last: false,
  })

  if (outlinePoints.length === 0) return

  const pathStr = getSvgPathFromStroke(outlinePoints)
  const path = new Path2D(pathStr)

  ctx.fillStyle = color
  ctx.fill(path)
}

/** Redraw the entire committed layer */
export function redrawCommittedLayer(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  transform: TransformSystem,
  getOpacity: (id: string) => number
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  for (const stroke of strokes) {
    const opacity = getOpacity(stroke.id)
    if (opacity > 0) {
      renderStroke(ctx, stroke, transform, opacity)
    }
  }
}
