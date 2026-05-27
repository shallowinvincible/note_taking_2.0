/**
 * TransformSystem — owns zoom and pan state.
 *
 * Two coordinate spaces:
 *   World  — where strokes are stored (stable across zoom/pan)
 *   Screen — pixel coordinates on the canvas element
 *
 * World → Screen (rendering):
 *   sx = (wx - panOffset.x) * zoom
 *   sy = (wy - panOffset.y) * zoom
 *
 * Screen → World (input — applied to every pointer event before storing):
 *   wx = sx / zoom + panOffset.x
 *   wy = sy / zoom + panOffset.y
 */
export class TransformSystem {
  zoom: number = 1.0
  panX: number = 0
  panY: number = 0

  /** Convert a screen-space point to world coordinates. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: sx / this.zoom + this.panX,
      y: sy / this.zoom + this.panY,
    }
  }

  /** Convert a world-space point to screen coordinates. */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.panX) * this.zoom,
      y: (wy - this.panY) * this.zoom,
    }
  }

  /**
   * Zoom toward a screen-space focal point (pinch centre or wheel position).
   * Keeps the point under the cursor fixed in world space.
   */
  applyZoom(delta: number, focalScreenX: number, focalScreenY: number): void {
    const MIN_ZOOM = 0.1
    const MAX_ZOOM = 10

    // World position under the focal point before zoom
    const worldBefore = this.screenToWorld(focalScreenX, focalScreenY)

    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * delta))

    // After zoom the same world point must land on the same screen pixel
    const screenAfter = this.worldToScreen(worldBefore.x, worldBefore.y)
    this.panX += (focalScreenX - screenAfter.x) / this.zoom
    this.panY += (focalScreenY - screenAfter.y) / this.zoom
  }

  /** Translate pan by screen-space deltas. */
  applyPan(dsx: number, dsy: number): void {
    this.panX -= dsx / this.zoom
    this.panY -= dsy / this.zoom
  }

  /** Reset to 1:1, centred. */
  reset(): void {
    this.zoom = 1.0
    this.panX = 0
    this.panY = 0
  }
}
