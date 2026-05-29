import React, { useState } from 'react'
import { useToolStore, LIGHT_DEFAULT, DARK_DEFAULT } from '@/store/toolStore'
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
  Pointer,
  PenTool,
  Droplets,
  Minus
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
    inputMode, setInputMode,
    penColor, setPenColor, 
    penWidth, setPenWidth,
    eraserRadius, setEraserRadius,
    pressureEnabled, setPressureEnabled,
    background, setBackground,
    darkMode, setDarkMode 
  } = useToolStore()
  
  const { canUndo, canRedo, zoom } = useCanvasStore()
  
  const [showBgMenu, setShowBgMenu] = useState(false)
  const [showColorMenu, setShowColorMenu] = useState(false)
  const [showEraserMenu, setShowEraserMenu] = useState(false)

  const colors = [
    darkMode ? DARK_DEFAULT : LIGHT_DEFAULT,
    '#ef4444', '#3b82f6', '#22c55e', 
    '#f97316', '#a855f7', '#ec4899', '#ffffff'
  ]

  const widths = [
    { label: 'Fine', value: 2 },
    { label: 'Medium', value: 4 },
    { label: 'Thick', value: 8 }
  ]

  const eraserSizes = [
    { label: 'Small', value: 15 },
    { label: 'Large', value: 40 }
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
          title="Reset Zoom to Fit"
        >
          {Math.round(zoom * 100)}%
        </button>
      </div>

      <div className="w-px h-6 bg-black/5 dark:bg-white/10 mx-3" />

      {/* Input Mode Toggle */}
      <div className="flex items-center bg-neutral-100 dark:bg-white/5 rounded-full p-1 gap-1">
        <button
          onClick={() => setInputMode('stylus')}
          className={`p-1.5 rounded-full transition-all ${inputMode === 'stylus' ? 'bg-white dark:bg-white/10 shadow-sm text-blue-500' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'}`}
          title="Stylus Mode"
        >
          <PenTool size={16} />
        </button>
        <button
          onClick={() => setInputMode('finger')}
          className={`p-1.5 rounded-full transition-all ${inputMode === 'finger' ? 'bg-white dark:bg-white/10 shadow-sm text-blue-500' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'}`}
          title="Finger Mode"
        >
          <Pointer size={16} />
        </button>
      </div>

      <div className="w-px h-6 bg-black/5 dark:bg-white/10 mx-3" />

      {/* Pressure Toggle */}
      <button
        onClick={() => setPressureEnabled(!pressureEnabled)}
        className={`p-2 rounded-full transition-all ${pressureEnabled ? 'text-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5'}`}
        title={pressureEnabled ? "Pressure ON" : "Pressure OFF"}
      >
        {pressureEnabled ? <Droplets size={20} /> : <Minus size={20} />}
      </button>

      <div className="w-px h-6 bg-black/5 dark:bg-white/10 mx-3" />

      {/* Background Selector */}
      <div className="relative">
        <button 
          onClick={() => { setShowBgMenu(!showBgMenu); setShowColorMenu(false); setShowEraserMenu(false); }}
          className={`p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors flex items-center gap-1 ${showBgMenu ? 'bg-neutral-100 dark:bg-white/10' : ''}`}
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
          className={`p-2.5 rounded-full transition-all border-2 ${activeTool === 'pen' ? 'bg-blue-500 text-white border-blue-400 shadow-lg scale-110' : 'hover:bg-neutral-100 dark:hover:bg-white/10 border-transparent'}`}
          title="Pen"
        >
          <Pencil size={18} />
        </button>
        <div className="relative">
          <button
            onClick={() => {
              if (activeTool === 'eraser') setShowEraserMenu(!showEraserMenu)
              setTool('eraser')
              setShowColorMenu(false)
              setShowBgMenu(false)
            }}
            className={`p-2.5 rounded-full transition-all border-2 flex items-center gap-1 ${activeTool === 'eraser' ? 'bg-blue-500 text-white border-blue-400 shadow-lg scale-110' : 'hover:bg-neutral-100 dark:hover:bg-white/10 border-transparent'}`}
            title="Eraser"
          >
            <Eraser size={18} />
            {activeTool === 'eraser' && <ChevronDown size={14} />}
          </button>
          {showEraserMenu && activeTool === 'eraser' && (
            <div className="absolute top-full mt-4 left-1/2 -translate-x-1/2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-2 shadow-2xl min-w-[120px] z-[101]">
              {eraserSizes.map((s) => (
                <button
                  key={s.value}
                  onClick={() => { setEraserRadius(s.value); setShowEraserMenu(false); }}
                  className={`w-full flex items-center justify-between px-4 py-2 rounded-xl text-xs font-bold transition-colors ${eraserRadius === s.value ? 'bg-blue-500 text-white' : 'hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400'}`}
                >
                  {s.label}
                  {eraserRadius === s.value && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-px h-6 bg-black/5 dark:bg-white/10 mx-2" />

      {/* Color Picker / Width */}
      <div className="relative">
        <button 
          onClick={() => { setShowColorMenu(!showColorMenu); setShowBgMenu(false); setShowEraserMenu(false); }}
          className={`p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors flex items-center gap-1.5 ${showColorMenu ? 'bg-neutral-100 dark:bg-white/10' : ''}`}
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
                   {penColor === c && <Check size={16} className={c === '#ffffff' || c === DARK_DEFAULT ? 'text-black' : 'text-white'} />}
                </button>
              ))}
            </div>
            
            <div className="space-y-3">
              <p className="text-[10px] uppercase font-black tracking-wider text-neutral-400 px-1">Pen Size</p>
              <div className="flex gap-1">
                {widths.map((w) => (
                  <button
                    key={w.value}
                    onClick={() => { setPenWidth(w.value); setShowColorMenu(false); }}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${penWidth === w.value ? 'bg-blue-500 text-white' : 'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-black/5 dark:bg-white/10 mx-2" />

      {/* Undo/Redo */}
      <div className="flex items-center gap-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`p-2 rounded-full transition-colors disabled:opacity-20 ${canUndo ? 'hover:bg-neutral-100 dark:hover:bg-white/10' : ''}`}
        >
          <Undo2 size={20} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`p-2 rounded-full transition-colors disabled:opacity-20 ${canRedo ? 'hover:bg-neutral-100 dark:hover:bg-white/10' : ''}`}
        >
          <Redo2 size={20} />
        </button>
      </div>

      <div className="w-px h-6 bg-black/5 dark:bg-white/10 mx-2" />

      {/* Dark Mode */}
      <button
        onClick={() => setDarkMode(!darkMode)}
        className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors"
      >
        {darkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>

    </div>
  )
}
