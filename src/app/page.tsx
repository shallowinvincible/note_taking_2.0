'use client'

import React from 'react'
import { useCanvas } from '@/hooks/useCanvas'
import { Toolbar } from '@/components/Toolbar'

export default function Home() {
  const { bgCanvasRef, committedCanvasRef, activeCanvasRef, cursorCanvasRef, undo, redo, fitPage } = useCanvas()

  return (
    <main className="fixed inset-0 overflow-hidden bg-neutral-200 dark:bg-neutral-900 select-none touch-none">
      {/* 
        Defining a single relative container for the 4 absolute canvas layers.
        Stacking order:
        1. Background (Desk, Page, Grid, Page Separators)
        2. Committed Strokes (The note content)
        3. Active Stroke (The stroke currently being drawn)
        4. Cursor (Pen tip indicator or Eraser circle)
      */}
      <div className="relative w-full h-full">
        <canvas
          ref={bgCanvasRef}
          className="absolute top-0 left-0 w-full h-full z-10"
        />
        <canvas
          ref={committedCanvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none z-20"
        />
        <canvas
          ref={activeCanvasRef}
          className="absolute top-0 left-0 w-full h-full cursor-none pointer-events-auto z-30"
        />
        <canvas
          ref={cursorCanvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none z-40"
        />
      </div>

      <Toolbar onUndo={undo} onRedo={redo} onResetZoom={fitPage} />
    </main>
  )
}
