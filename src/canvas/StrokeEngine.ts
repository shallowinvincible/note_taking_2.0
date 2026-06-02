import getStroke from 'perfect-freehand'
import type { Stroke } from '@/types/stroke'
import type { TransformSystem } from './TransformSystem'

/** Options for Perfect Freehand based on pressure toggle */
export function getStrokeOptions(width: number, zoom: number, pressureEnabled: boolean, simulatePressure: boolean) {
  return {
    size: width * zoom,
    thinning: pressureEnabled ? 0.5 : 0,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: simulatePressure,
    last: true,
  }
}

/** Convert perfect-freehand outline points to SVG path string */
export function getSvgPathFromStroke(points: number[][]): string {
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

/** Render a single committed stroke to a specific context at screen coordinates */
export function renderStroke(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  stroke: Stroke,
  transform: TransformSystem,
  opacity: number = 1.0,
  pressureEnabled: boolean = true
): void {
  if (stroke.points.length === 0) return

  const zoom = transform.zoom
  const inputPoints = stroke.points.map((p) => {
    const { x, y } = transform.worldToScreen(p.x, p.y)
    return [x, y, p.pressure]
  })

  const outlinePoints = getStroke(
    inputPoints, 
    getStrokeOptions(stroke.width, zoom, pressureEnabled, stroke.simulatePressure ?? false)
  )

  if (outlinePoints.length === 0) return

  const pathStr = getSvgPathFromStroke(outlinePoints)
  const path = new Path2D(pathStr)

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.fillStyle = stroke.color
  ctx.fill(path)
  ctx.restore()
}

/** 
 * Render a single stroke at world coordinates (1:1 scale) to a specific context.
 * Used for the offscreen world-space buffer.
 */
export function renderStrokeToWorld(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  stroke: Stroke,
  pressureEnabled: boolean = true,
  scale: number = 1.0
): void {
  ctx.imageSmoothingEnabled = false
  
  // Apply scale to world coordinates
  const inputPoints = stroke.points.map(p => [p.x * scale, p.y * scale, p.pressure])
  
  const outlinePoints = getStroke(
    inputPoints,
    {
      size: stroke.width * scale,
      thinning: pressureEnabled ? 0.5 : 0,
      smoothing: 0.6,
      streamline: 0.5,
      simulatePressure: !pressureEnabled,
      last: true
    }
  )
  if (outlinePoints.length === 0) return
  const path = new Path2D(getSvgPathFromStroke(outlinePoints))
  ctx.fillStyle = stroke.color
  ctx.fill(path)
}

/** Render the active (in-progress) stroke */
export function renderActiveStroke(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number; pressure: number }[],
  color: string,
  width: number,
  transform: TransformSystem,
  pressureEnabled: boolean = true,
  simulatePressure: boolean = false
): void {
  if (points.length < 1) return

  const zoom = transform.zoom
  const inputPoints = points.map((p) => {
    const { x, y } = transform.worldToScreen(p.x, p.y)
    return [x, y, p.pressure]
  })

  const options = getStrokeOptions(width, zoom, pressureEnabled, simulatePressure)
  const outlinePoints = getStroke(inputPoints, { ...options, last: false })

  if (outlinePoints.length === 0) return

  const pathStr = getSvgPathFromStroke(outlinePoints)
  const path = new Path2D(pathStr)

  ctx.fillStyle = color
  ctx.fill(path)
}
