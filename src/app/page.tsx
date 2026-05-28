'use client'

import React from 'react'
import { useCanvas } from '@/hooks/useCanvas'
import { Toolbar } from '@/components/Toolbar'

export default function Home() {
  const { bgCanvasRef, committedCanvasRef, activeCanvasRef, cursorCanvasRef, undo, redo, fitPage } = useCanvas()

  return (
    <main className="fixed inset-0 overflow-hidden bg-neutral-200 dark:bg-neutral-900 select-none touch-none">
      {/* 
        The Stack:
        - Layer 1: Background (desk + page + grid)
        - Layer 2: Committed strokes (persistent data)
        - Layer 3: Active stroke (real-time in-progress line)
        - Layer 4: Cursor (eraser circle, overlays)
      */}
      <canvas
        ref={bgCanvasRef}
        className="absolute inset-0 block"
      />
      <canvas
        ref={committedCanvasRef}
        className="absolute inset-0 block pointer-events-none"
      />
      <canvas
        ref={activeCanvasRef}
        className="absolute inset-0 block cursor-none pointer-events-auto"
      />
      <canvas
        ref={cursorCanvasRef}
        className="absolute inset-0 block pointer-events-none"
      />

      <Toolbar onUndo={undo} onRedo={redo} onResetZoom={fitPage} />
    </main>
  )
}
