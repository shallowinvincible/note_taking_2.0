export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  public debugEnabled: boolean = true;

  private frameCount: number = 0;
  private lastFpsUpdate: number = performance.now();
  private currentFps: number = 60;
  
  private lastRenderTime: number = 0;
  private longestFrame: number = 0;

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  public recordFrame(renderTime: number) {
    this.frameCount++;
    this.lastRenderTime = renderTime;
    this.longestFrame = Math.max(this.longestFrame, renderTime);
    
    const now = performance.now();
    const elapsed = now - this.lastFpsUpdate;
    if (elapsed >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      this.logMetrics();
    }
  }

  private logMetrics() {
    if (!this.debugEnabled) return;
    
    // Using a simple log or we could expose this to a UI overlay.
    // The user requested console.log instrumentation.
    console.log(`[PERF] FPS: ${this.currentFps} | Last Render: ${this.lastRenderTime.toFixed(2)}ms | Longest Frame: ${this.longestFrame.toFixed(2)}ms`);
    this.longestFrame = 0; // reset for next second
  }

  public startMeasure(label: string): number {
    return performance.now();
  }

  public endMeasure(start: number, label: string) {
    const duration = performance.now() - start;
    if (this.debugEnabled && duration > 5) {
       console.warn(`[PERF][SLOW] ${label}: ${duration.toFixed(2)}ms`);
    } else if (this.debugEnabled) {
       // console.log(`[PERF] ${label}: ${duration.toFixed(2)}ms`);
    }
    return duration;
  }
  
  public getMetrics() {
    return {
      fps: this.currentFps,
      lastRender: this.lastRenderTime
    }
  }
}

export const perf = PerformanceMonitor.getInstance();
