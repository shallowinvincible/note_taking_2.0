'use client'

import { useToolStore } from '@/store/toolStore'
import { useCanvasStore } from '@/store/canvasStore'

interface ToolbarProps {
  onUndo: () => void
  onRedo: () => void
}

const PenIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
)

const EraserIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 20H7L3 16l10-10 7 7-2.5 2.5"/>
    <path d="M6.0 11.0 2.5 14.5"/>
  </svg>
)

const UndoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 14 4 9 9 4"/>
    <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
  </svg>
)

const RedoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 14 20 9 15 4"/>
    <path d="M4 20v-7a4 4 0 0 1 4-4h12"/>
  </svg>
)

const COLORS = [
  '#1a1a1a', // near-black
  '#2563eb', // blue
  '#dc2626', // red
  '#16a34a', // green
  '#9333ea', // purple
  '#ea580c', // orange
]

export default function Toolbar({ onUndo, onRedo }: ToolbarProps) {
  const { activeTool, penColor, penWidth, setTool, setPenColor, setPenWidth } = useToolStore()
  const { canUndo, canRedo, zoomLevel } = useCanvasStore()

  return (
    <div
      className="toolbar"
      // Prevent pointer events on the toolbar from reaching the canvas
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Tool group */}
      <div className="toolbar-group">
        <button
          id="tool-pen"
          className={`toolbar-btn ${activeTool === 'pen' ? 'active' : ''}`}
          onClick={() => setTool('pen')}
          title="Pen (P)"
          aria-label="Pen tool"
        >
          <PenIcon />
        </button>
        <button
          id="tool-eraser"
          className={`toolbar-btn ${activeTool === 'eraser' ? 'active' : ''}`}
          onClick={() => setTool('eraser')}
          title="Eraser (E)"
          aria-label="Eraser tool"
        >
          <EraserIcon />
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Color swatches */}
      <div className="toolbar-group">
        {COLORS.map((color) => (
          <button
            key={color}
            id={`color-${color.replace('#', '')}`}
            className={`color-swatch ${penColor === color ? 'ring-2 ring-offset-1 ring-white/80' : ''}`}
            style={{ backgroundColor: color }}
            onClick={() => { setTool('pen'); setPenColor(color) }}
            aria-label={`Color ${color}`}
          />
        ))}
      </div>

      <div className="toolbar-divider" />

      {/* Pen size */}
      <div className="toolbar-group items-center gap-2">
        <span className="text-white/50 text-xs font-medium">Size</span>
        <input
          id="pen-size"
          type="range"
          min={1}
          max={24}
          value={penWidth}
          onChange={(e) => setPenWidth(Number(e.target.value))}
          className="size-slider"
          aria-label="Pen size"
        />
        <span className="text-white/70 text-xs w-4 text-center">{penWidth}</span>
      </div>

      <div className="toolbar-divider" />

      {/* Undo / Redo */}
      <div className="toolbar-group">
        <button
          id="btn-undo"
          className={`toolbar-btn ${!canUndo ? 'opacity-30' : ''}`}
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <UndoIcon />
        </button>
        <button
          id="btn-redo"
          className={`toolbar-btn ${!canRedo ? 'opacity-30' : ''}`}
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <RedoIcon />
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Zoom badge */}
      <div className="zoom-badge">
        {Math.round(zoomLevel * 100)}%
      </div>
    </div>
  )
}
