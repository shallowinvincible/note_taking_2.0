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

/**
 * Generate a unique id for a stroke.
 *
 * `crypto.randomUUID()` only exists in a secure context (HTTPS or localhost),
 * so over plain HTTP on a LAN IP (e.g. testing on an iPad via
 * http://192.168.x.x:3000) it is undefined and throws. Fall back to
 * `crypto.getRandomValues` and finally to a Math.random()-based id so stroke
 * commits never fail regardless of context.
 */
export function genId(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID()
  }
  if (c && typeof c.getRandomValues === 'function') {
    const b = c.getRandomValues(new Uint8Array(16))
    b[6] = (b[6] & 0x0f) | 0x40 // version 4
    b[8] = (b[8] & 0x3f) | 0x80 // variant
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'))
    return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`
  }
  return `id-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
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
