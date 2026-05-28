/** Point always stored in world coordinates */
export type Point = {
  x: number
  y: number
  pressure: number
}

/** Precomputed bounding box in world coordinates, stored per stroke */
export type BBox = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type StrokeTool = 'pen' | 'eraser' | 'finger'

export type Background = 'blank' | 'ruled' | 'dotted' | 'grid' | 'cornell'

export type Stroke = {
  id: string
  tool: StrokeTool
  color: string
  width: number
  points: Point[]
  bbox: BBox       // world-coord bounding box — computed on commit
  createdAt: number
  simulatePressure?: boolean
}

/** Compute bounding box from a point array */
export function computeBBox(points: Point[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}
