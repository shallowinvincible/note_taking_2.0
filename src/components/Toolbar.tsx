import React, { useState } from 'react'
import { useToolStore } from '@/store/toolStore'
import { useCanvasStore } from '@/store/canvasStore'
import { 
  Pencil, 
  Eraser, 
  Undo2, 
  Redo2, 
  Sun, 
  Moon, 
  Grid, 
  Layout, 
  Check,
  ChevronDown,
  Maximize
} from 'lucide-react'
import type { Background } from '@/types/stroke'

export function Toolbar({ 
  onUndo, 
  onRedo,
  onResetZoom 
}: { 
  onUndo: () => void, 
  onRedo: () => void,
  onResetZoom: () => void 
}) {
  const { 
    activeTool, setTool, 
    penColor, setPenColor, 
    penWidth, setPenWidth,
    background, setBackground,
    darkMode, setDarkMode 
  } = useToolStore()
  
  const { canUndo, canRedo, zoom } = useCanvasStore()
  
  const [showBgMenu, setShowBgMenu] = useState(false)
  const [showColorMenu, setShowColorMenu] = useState(false)

  const colors = [
    '#1a1a1a', '#ef4444', '#3b82f6', '#22c55e', 
    '#f97316', '#a855f7', '#ec4899', '#ffffff'
  ]

  const widths = [
    { label: 'Fine', value: 2 },
    { label: 'Medium', value: 4 },
    { label: 'Thick', value: 8 }
  ]

  const bgOptions: { id: Background; label: string; icon: any }[] = [
    { id: 'blank', label: 'Blank', icon: Sun },
    { id: 'ruled', label: 'Ruled', icon: Layout },
    { id: 'dotted', label: 'Dotted', icon: Grid },
    { id: 'grid', label: 'Grid', icon: Grid },
    { id: 'cornell', label: 'Cornell', icon: Layout }
  ]

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center bg-white/90 dark:bg-black/80 backdrop-blur-md border border-white/20 dark:border-white/10 px-4 py-2 rounded-full shadow-2xl transition-all pointer-events-auto select-none">
      
      {/* Zoom Indicator */}
      <div className="flex items-center">
        <button 
          onClick={(e) => { e.stopPropagation(); onResetZoom(); }}
          className="px-3 py-1.5 text-[11px] font-black font-mono bg-neutral-100 dark:bg-white/10 rounded-full hover:bg-neutral-200 dark:hover:bg-white/20 transition-all border border-transparent active:scale-95"
          title="Reset Zoom to Fit (Click to Reset)"
        >
          {Math.round(zoom * 100)}%
        </button>
      </div>

      <div className="w-px h-6 bg-black/5 dark:bg-white/10 mx-3" />

      {/* Background Selector */}
      <div className="relative group">
        <button 
          onClick={() => { setShowBgMenu(!showBgMenu); setShowColorMenu(false); }}
          className={`p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors flex items-center gap-1 ${showBgMenu ? 'bg-neutral-100 dark:bg-white/10' : ''}`}
          title="Background Template"
        >
          <Grid size={20} />
          <ChevronDown size={14} className={`transition-transform ${showBgMenu ? 'rotate-180' : ''}`} />
        </button>
        {showBgMenu && (
          <div className="absolute top-full mt-4 left-0 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-2 shadow-2xl min-w-[180px] toolbar-popover z-[101]">
            {bgOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => { setBackground(opt.id); setShowBgMenu(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl transition-colors text-sm ${background === opt.id ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' : 'hover:bg-neutral-100 dark:hover:bg-white/5'}`}
              >
                <opt.icon size={16} className={background === opt.id ? 'text-blue-500' : 'text-neutral-500'} />
                <span className="flex-1 text-left font-medium">{opt.label}</span>
                {background === opt.id && <Check size={14} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-black/5 dark:bg-white/10 mx-2" />

      {/* Tools */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setTool('pen')}
          className={`p-2.5 rounded-full transition-all border-2 ${activeTool !== 'eraser' ? 'bg-blue-500 text-white border-blue-400 shadow-lg scale-110' : 'hover:bg-neutral-100 dark:hover:bg-white/10 border-transparent'}`}
          title="Pen tool"
        >
          <Pencil size={18} />
        </button>
        <button
          onClick={() => setTool('eraser')}
          className={`p-2.5 rounded-full transition-all border-2 ${activeTool === 'eraser' ? 'bg-blue-500 text-white border-blue-400 shadow-lg scale-110' : 'hover:bg-neutral-100 dark:hover:bg-white/10 border-transparent'}`}
          title="Eraser tool"
        >
          <Eraser size={18} />
        </button>
      </div>

      <div className="w-px h-6 bg-black/5 dark:bg-white/10 mx-2" />

      {/* Color Picker & Width selector */}
      <div className="relative">
        <button 
          onClick={() => { setShowColorMenu(!showColorMenu); setShowBgMenu(false); }}
          className={`p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors flex items-center gap-1.5 ${showColorMenu ? 'bg-neutral-100 dark:bg-white/10' : ''}`}
          title="Color & Width"
        >
          <div 
            className="w-7 h-7 rounded-full border-2 border-white dark:border-neutral-800 shadow-inner" 
            style={{ backgroundColor: penColor }}
          />
          <ChevronDown size={14} className={`transition-transform ${showColorMenu ? 'rotate-180' : ''}`} />
        </button>
        {showColorMenu && (
          <div className="absolute top-full mt-4 left-1/2 -translate-x-1/2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-5 shadow-2xl min-w-[240px] toolbar-popover z-[101]">
            <div className="grid grid-cols-4 gap-3 mb-6">
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => { setPenColor(c); setShowColorMenu(false); }}
                  className={`w-10 h-10 rounded-full border-4 transition-all hover:scale-110 flex items-center justify-center ${penColor === c ? 'border-blue-500 shadow-md' : 'border-transparent shadow-sm'}`}
                  style={{ backgroundColor: c }}
                >
                   {penColor === c && <Check size={16} className={c === '#ffffff' ? 'text-black' : 'text-white'} />}
                </button>
              ))}
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                 <p className="text-[10px] uppercase font-black tracking-wider text-neutral-400">Pen Size</p>
                 <div className="w-10 h-[1px] bg-neutral-100 dark:bg-white/10" />
              </div>
              <div className="flex gap-1">
                {widths.map((w) => (
                  <button
                    key={w.value}
                    onClick={() => { setPenWidth(w.value); setShowColorMenu(false); }}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${penWidth === w.value ? 'bg-blue-500 text-white shadow-md' : 'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-white/5">
              <input 
                type="color" 
                value={penColor} 
                onChange={(e) => setPenColor(e.target.value)}
                className="w-full h-8 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-neutral-200 dark:bg-neutral-800 mx-2" />

      {/* Undo/Redo */}
      <div className="flex items-center gap-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`p-2 rounded-full transition-colors disabled:opacity-20 ${canUndo ? 'hover:bg-neutral-100 dark:hover:bg-white/10' : ''}`}
          title="Undo"
        >
          <Undo2 size={20} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`p-2 rounded-full transition-colors disabled:opacity-20 ${canRedo ? 'hover:bg-neutral-100 dark:hover:bg-white/10' : ''}`}
          title="Redo"
        >
          <Redo2 size={20} />
        </button>
      </div>

      <div className="w-px h-6 bg-neutral-200 dark:bg-neutral-800 mx-2" />

      {/* Dark Mode */}
      <button
        onClick={() => setDarkMode(!darkMode)}
        className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors"
        title="Toggle Dark Mode"
      >
        {darkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>

    </div>
  )
}
