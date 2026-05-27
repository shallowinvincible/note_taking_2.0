'use client'

import { useCanvas } from '@/hooks/useCanvas'
import Toolbar from '@/components/Toolbar'

export default function CanvasPage() {
  const { committedCanvasRef, activeCanvasRef, undo, redo } = useCanvas()

  return (
    <main className="canvas-container">
      {/* Page background — paper feel */}
      <div className="paper-bg" />

      {/*
        Two-layer canvas stack:
          committed — persisted strokes (only redrawn on undo/redo/zoom/pan)
          active    — current in-progress stroke (cleared every frame)
        Active sits on top so it receives all pointer events.
      */}
      <canvas
        ref={committedCanvasRef}
        id="canvas-committed"
        className="canvas-layer committed-layer"
        aria-label="Committed strokes"
      />
      <canvas
        ref={activeCanvasRef}
        id="canvas-active"
        className="canvas-layer active-layer"
        aria-label="Drawing surface"
      />

      <Toolbar onUndo={undo} onRedo={redo} />
    </main>
  )
}
