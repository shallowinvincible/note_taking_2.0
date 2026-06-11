import { renderStrokeToWorld } from './StrokeEngine';
import type { Stroke } from '@/types/stroke';

export interface PageMetrics {
  total: number;
  visible: number;
  dirty: number;
  memoryEstimate: string;
}

export class PageManager {
  private pages: Map<number, OffscreenCanvas> = new Map();
  private pageContexts: Map<number, OffscreenCanvasRenderingContext2D> = new Map();
  private dirtyPages: Set<number> = new Set();
  
  private pageWidth: number;
  private pageHeight: number;
  private bufferScale: number;

  constructor(pageWidth: number, pageHeight: number, bufferScale: number) {
    this.pageWidth = pageWidth;
    this.pageHeight = pageHeight;
    this.bufferScale = bufferScale;
  }

  /** Initialize a specific page if it doesn't exist */
  public ensurePage(index: number) {
    if (!this.pages.has(index)) {
      const canvas = new OffscreenCanvas(
        this.pageWidth * this.bufferScale, 
        this.pageHeight * this.bufferScale
      );
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        this.pages.set(index, canvas);
        this.pageContexts.set(index, ctx);
        this.dirtyPages.add(index);
      }
    }
  }

  /** Populate a page with all intersecting strokes */
  private populatePage(index: number, strokes: Stroke[], pressureEnabled: boolean, eraserPending: Set<string>) {
    const ctx = this.pageContexts.get(index);
    if (!ctx) return;

    for (const stroke of strokes) {
      if (eraserPending.has(stroke.id)) continue;
      const pages = this.getPagesForStroke(stroke);
      if (pages.includes(index)) {
        ctx.save();
        ctx.translate(0, -index * this.pageHeight * this.bufferScale);
        renderStrokeToWorld(ctx, stroke, pressureEnabled, this.bufferScale);
        ctx.restore();
      }
    }
    this.dirtyPages.delete(index);
  }

  /** Identify which pages a stroke covers based on its BBox */
  public getPagesForStroke(stroke: any): number[] {
    const startPage = Math.floor(stroke.bbox.minY / this.pageHeight);
    const endPage = Math.floor(stroke.bbox.maxY / this.pageHeight);
    const indices: number[] = [];
    for (let i = Math.max(0, startPage); i <= endPage; i++) {
       indices.push(i);
    }
    return indices;
  }

  /** Render a single stroke into its relevant page buffers */
  public renderStrokeToPages(stroke: Stroke, pressureEnabled: boolean) {
    const indices = this.getPagesForStroke(stroke);
    for (const index of indices) {
      this.ensurePage(index);
      const ctx = this.pageContexts.get(index);
      if (ctx) {
        // We need to translate the context so that world (0, pageTop) maps to (0, 0) in the buffer
        ctx.save();
        ctx.translate(0, -index * this.pageHeight * this.bufferScale);
        renderStrokeToWorld(ctx, stroke, pressureEnabled, this.bufferScale);
        ctx.restore();
      }
    }
  }

  /** Mark pages as dirty (e.g. after undo/redo/erase) */
  public markDirty(indices: number[]) {
    for (const i of indices) this.dirtyPages.add(i);
  }

  public rebuildPages(strokes: Stroke[], pressureEnabled: boolean, eraserPending: Set<string>) {
    // Clear all existing buffers
    for (const [index, ctx] of this.pageContexts) {
      ctx.clearRect(0, 0, this.pageWidth * this.bufferScale, this.pageHeight * this.bufferScale);
      this.dirtyPages.add(index);
    }

    for (const stroke of strokes) {
      if (eraserPending.has(stroke.id)) continue;
      this.renderStrokeToPages(stroke, pressureEnabled);
    }
  }

  /** Calculate visible page range based on view transform */
  public getVisiblePageRange(panY: number, zoom: number, viewportHeight: number): { start: number; end: number } {
    // panY is in world units.
    // viewport top is panY
    // viewport bottom is panY + (viewportHeight / zoom)
    const viewTop = panY;
    const viewBottom = panY + (viewportHeight / zoom);

    const start = Math.max(0, Math.floor(viewTop / this.pageHeight));
    const end = Math.floor(viewBottom / this.pageHeight);

    return { start, end };
  }

  /** Draw all visible pages to the target context */
  public renderToScreen(
    ctx: CanvasRenderingContext2D, 
    panX: number, 
    panY: number, 
    zoom: number, 
    viewportWidth: number,
    viewportHeight: number,
    allStrokes: Stroke[],
    pressureEnabled: boolean,
    eraserPending: Set<string>
  ) {
    const { start, end } = this.getVisiblePageRange(panY, zoom, viewportHeight);
    
    // Memory Limit Implementation (Requirement 8)
    this.pruneCache(start, end);

    for (let i = start; i <= end; i++) {
       // If page doesn't exist (new or pruned), create and populate it
       if (!this.pages.has(i)) {
         this.ensurePage(i);
         this.populatePage(i, allStrokes, pressureEnabled, eraserPending);
       }
       
       const buffer = this.pages.get(i);
       if (!buffer) continue;

      // Calculate destination rectangle in screen coordinates
      // World top-left of page i is (0, i * pageHeight)
      const worldX = 0;
      const worldY = i * this.pageHeight;
      
      const screenX = (worldX - panX) * zoom;
      const screenY = (worldY - panY) * zoom;
      const screenW = this.pageWidth * zoom;
      const screenH = this.pageHeight * zoom;

      // Draw high-quality buffer
      // Source rect is the full buffer
      ctx.drawImage(
        buffer,
        0, 0, this.pageWidth * this.bufferScale, this.pageHeight * this.bufferScale,
        Math.round(screenX), Math.round(screenY), Math.round(screenW), Math.round(screenH)
      );
    }

    return { start, end, total: this.pages.size };
  }

  private pruneCache(start: number, end: number) {
    // Keep only a small halo of pages around the viewport. Combined with the
    // DPR-based buffer scale this caps total canvas memory at a level iOS Safari
    // can sustain even in a 1000-page notebook (only ~6 page buffers are ever
    // resident). Off-screen pages are re-rendered on demand when scrolled back.
    const threshold = 2;
    for (const pageIndex of this.pages.keys()) {
      if (pageIndex < start - threshold || pageIndex > end + threshold) {
        this.pages.delete(pageIndex);
        this.pageContexts.delete(pageIndex);
      }
    }
  }

  public getMetrics(visibleCount: number): PageMetrics {
    const memory = (this.pages.size * this.pageWidth * this.pageHeight * 4 * Math.pow(this.bufferScale, 2)) / (1024 * 1024);
    return {
      total: this.pages.size,
      visible: visibleCount,
      dirty: this.dirtyPages.size,
      memoryEstimate: `${memory.toFixed(1)}MB`
    };
  }

  public clear() {
    this.pages.clear();
    this.pageContexts.clear();
    this.dirtyPages.clear();
  }
}
