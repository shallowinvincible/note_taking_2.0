'use client'

import React from 'react'
import { useCanvas } from '@/hooks/useCanvas'
import { Toolbar } from '@/components/Toolbar'

// Inline style applied to every canvas layer.
// CRITICAL for Apple Pencil on iPadOS: touch-action must be set as an
// inline style (not only a CSS class) so it is guaranteed to be present
// before the very first pointer event fires. Tailwind classes may load
// asynchronously on first paint, which leaves a window where iPadOS can
// intercept Pencil events for system gestures.
const noTouchStyle: React.CSSProperties = { touchAction: 'none' }

export default function Home() {
  const { bgCanvasRef, committedCanvasRef, activeCanvasRef, cursorCanvasRef, undo, redo, fitPage } = useCanvas()

  return (
    <main
      className="fixed inset-0 overflow-hidden bg-neutral-200 dark:bg-neutral-900 select-none touch-none cursor-none"
      style={noTouchStyle}
    >
      <div className="relative w-full h-full" style={noTouchStyle}>
        {/* 1. Background (desk, page, grid) */}
        <canvas
          ref={bgCanvasRef}
          className="absolute top-0 left-0 w-full h-full z-10"
          style={noTouchStyle}
        />
        {/* 2. Committed strokes */}
        <canvas
          ref={committedCanvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none z-20"
          style={noTouchStyle}
        />
        {/* 3. Active stroke (receives all pointer events) */}
        <canvas
          ref={activeCanvasRef}
          className="absolute top-0 left-0 w-full h-full cursor-none pointer-events-auto z-30"
          style={noTouchStyle}
        />
        {/* 4. Cursor overlay */}
        <canvas
          ref={cursorCanvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none z-40"
          style={noTouchStyle}
        />
      </div>

      <Toolbar onUndo={undo} onRedo={redo} onResetZoom={fitPage} />
    </main>
  )
}
