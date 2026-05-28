/**
 * TransformSystem — owns zoom and pan state.
 *
 * World → Screen (rendering):
 *   sx = (wx - panX) * zoom
 *   sy = (wy - panY) * zoom
 *
 * Screen → World (input — applied on every pointer event before storing):
 *   wx = sx / zoom + panX
 *   wy = sy / zoom + panY
 */
export class TransformSystem {
  zoom: number = 1.0
  panX: number = 0
  panY: number = 0

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: sx / this.zoom + this.panX,
      y: sy / this.zoom + this.panY,
    }
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.panX) * this.zoom,
      y: (wy - this.panY) * this.zoom,
    }
  }

  /**
   * Zoom toward a screen-space focal point.
   * Keeps the world point under the focal position fixed.
   */
  applyZoom(delta: number, focalScreenX: number, focalScreenY: number): void {
    const MIN_ZOOM = 0.2
    const MAX_ZOOM = 8.0

    const worldBefore = this.screenToWorld(focalScreenX, focalScreenY)
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * delta))
    const screenAfter = this.worldToScreen(worldBefore.x, worldBefore.y)
    this.panX += (focalScreenX - screenAfter.x) / this.zoom
    this.panY += (focalScreenY - screenAfter.y) / this.zoom
  }

  /**
   * Set absolute zoom level toward a screen-space focal point.
   * Used by pinch-zoom where the raw zoom value is computed externally.
   */
  setZoomToward(newZoom: number, focalScreenX: number, focalScreenY: number): void {
    const MIN_ZOOM = 0.2
    const MAX_ZOOM = 5.0
    newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom))

    const worldX = focalScreenX / this.zoom + this.panX
    const worldY = focalScreenY / this.zoom + this.panY
    this.zoom = newZoom
    this.panX = worldX - focalScreenX / this.zoom
    this.panY = worldY - focalScreenY / this.zoom
  }

  /** Translate pan by screen-space deltas. */
  applyPan(dsx: number, dsy: number): void {
    this.panX -= dsx / this.zoom
    this.panY -= dsy / this.zoom
  }

  /** Scroll vertically only (one-finger / mouse wheel). */
  applyScrollY(dsy: number): void {
    this.panY += dsy / this.zoom
  }

  /**
   * Initialize transform to fit the page width with padding and center it.
   */
  initFitPage(viewportW: number, viewportH: number, pageW: number): void {
    const padding = 80 // 40px each side
    const targetZoom = (viewportW - padding) / pageW
    
    this.zoom = Math.min(targetZoom, 1.2) // Don't over-zoom on massive screens
    this.panX = -(viewportW / 2 - (pageW * this.zoom) / 2) / this.zoom
    this.panY = -40 / this.zoom
  }

  reset(): void {
    this.zoom = 1.0
    this.panX = 0
    this.panY = 0
  }
}
