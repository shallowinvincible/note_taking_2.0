import type { Stroke } from '@/types/stroke'

/**
 * EraserSystem handles collision detection and animations for the stroke eraser.
 */
export class EraserSystem {
  pendingErase = new Set<string>()
  private opacityMap = new Map<string, number>() // strokeId -> current opacity
  private targetOpacityMap = new Map<string, number>() // strokeId -> target opacity
  private deletedIds = new Set<string>() // IDs that have reached 0 opacity and are ready for official deletion
  lastScreenPos = { x: -100, y: -100 }

  /**
   * Checks for hits between eraser circle and strokes.
   * Uses bounding box pre-filtering for performance.
   */
  checkHits(worldX: number, worldY: number, radius: number, strokes: Stroke[]): boolean {
    let changed = false
    const currentHits = new Set<string>()

    for (const stroke of strokes) {
      if (this.deletedIds.has(stroke.id)) continue

      const { bbox } = stroke
      const hitRadius = radius + (stroke.width / 2)
      
      // Bounding box filter
      if (
        worldX + hitRadius < bbox.minX ||
        worldX - hitRadius > bbox.maxX ||
        worldY + hitRadius < bbox.minY ||
        worldY - hitRadius > bbox.maxY
      ) {
        continue
      }

      // Exact point check
      const rSq = hitRadius * hitRadius
      let isHit = false
      for (const p of stroke.points) {
        const dx = p.x - worldX
        const dy = p.y - worldY
        if (dx * dx + dy * dy <= rSq) {
          isHit = true
          break
        }
      }

      if (isHit) {
        currentHits.add(stroke.id)
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

  /**
   * Animates opacity for smooth fades.
   * Call this on every render frame.
   */
  tick(dt: number): boolean {
    let animating = false
    const FADE_RATE = 1.0 / 150 // 150ms full fade
    const DELETE_RATE = 1.0 / 100 // 100ms delete fade

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
