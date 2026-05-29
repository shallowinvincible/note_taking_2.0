import type { Stroke, BBox } from '@/types/stroke'

/**
 * EraserSystem handles collision detection and animations for the stroke eraser.
 */
export class EraserSystem {
  pendingErase = new Set<string>()
  lastScreenPos = { x: -1000, y: -1000 }
  
  private opacityMap = new Map<string, number>() // strokeId -> current opacity
  private targetOpacityMap = new Map<string, number>() // strokeId -> target opacity
  private deletedIds = new Set<string>() // IDs that have reached 0 opacity

  /**
   * Checks if the eraser circle intersects any part of the stroke.
   * Step 1: Bounding box pre-filter (fast)
   * Step 2: Point proximity check (precise)
   */
  checkHits(worldX: number, worldY: number, radius: number, strokes: Stroke[]): boolean {
    let changed = false
    const hitRadius = radius // eraserRadius is in world units
    
    for (const stroke of strokes) {
      if (this.deletedIds.has(stroke.id)) continue

      const isHit = this.eraserHitsStroke(worldX, worldY, hitRadius, stroke)

      if (isHit) {
        if (!this.pendingErase.has(stroke.id)) {
          this.pendingErase.add(stroke.id)
          this.targetOpacityMap.set(stroke.id, 0.3)
          changed = true
        }
      } else {
        if (this.pendingErase.has(stroke.id)) {
          this.pendingErase.delete(stroke.id)
          this.targetOpacityMap.set(stroke.id, 1.0)
          changed = true
        }
      }
    }
    return changed
  }

  private eraserOverlapsBoundingBox(ex: number, ey: number, er: number, bbox: BBox): boolean {
    return ex >= bbox.minX - er &&
           ex <= bbox.maxX + er &&
           ey >= bbox.minY - er &&
           ey <= bbox.maxY + er
  }

  private eraserHitsStroke(ex: number, ey: number, er: number, stroke: Stroke): boolean {
    if (!this.eraserOverlapsBoundingBox(ex, ey, er, stroke.bbox)) {
      return false
    }

    const hitDistance = er + (stroke.width / 2)
    const hitDistanceSq = hitDistance * hitDistance

    for (const point of stroke.points) {
      const dx = point.x - ex
      const dy = point.y - ey
      if (dx * dx + dy * dy <= hitDistanceSq) return true
    }

    return false
  }

  tick(dt: number): boolean {
    let animating = false
    const FADE_RATE = 1.0 / 150 
    const DELETE_RATE = 1.0 / 100 

    for (const [id, target] of this.targetOpacityMap) {
      const current = this.opacityMap.get(id) ?? 1.0
      const isDeleting = target === 0
      const rate = isDeleting ? DELETE_RATE : FADE_RATE
      
      if (Math.abs(current - target) < 0.01) {
        this.opacityMap.set(id, target)
        this.targetOpacityMap.delete(id)
        if (target === 0) {
          this.deletedIds.add(id)
        }
      } else {
        const delta = Math.sign(target - current) * rate * dt
        this.opacityMap.set(id, Math.max(0, Math.min(1, current + delta)))
        animating = true
      }
    }
    return animating
  }

  commitErase(): string[] {
    const idsToCommit = Array.from(this.pendingErase)
    for (const id of idsToCommit) {
      this.targetOpacityMap.set(id, 0)
    }
    this.pendingErase.clear()
    return idsToCommit
  }

  getOpacity(id: string): number {
    return this.opacityMap.get(id) ?? 1.0
  }

  getDeletedAndClear(): string[] {
    const ids = Array.from(this.deletedIds)
    this.deletedIds.clear()
    for (const id of ids) {
      this.opacityMap.delete(id)
    }
    return ids
  }

  reset() {
    this.pendingErase.clear()
    this.opacityMap.clear()
    this.targetOpacityMap.clear()
    this.deletedIds.clear()
  }
}
