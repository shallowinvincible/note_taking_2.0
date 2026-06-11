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
    <div
      id="main-toolbar"
      className={`fixed left-1/2 -translate-x-1/2 z-[100] top-24 lg:top-6 max-w-[calc(100vw-1rem)] flex flex-wrap justify-center items-center gap-y-1 px-2 sm:px-4 py-2 rounded-3xl lg:rounded-full shadow-2xl transition-all border backdrop-blur-md pointer-events-auto select-none ${
        darkMode
          ? 'bg-neutral-950/95 border-neutral-800 text-neutral-100 shadow-black/60'
          : 'bg-white/95 border-neutral-200 text-neutral-800 shadow-neutral-300/50'
      }`}
    >
      {/* Zoom Indicator */}
      <div className="flex items-center">
        <button 
          onClick={(e) => { e.stopPropagation(); onResetZoom(); }}
          className={`px-3 py-1.5 text-[11px] font-black font-mono rounded-full hover:scale-105 active:scale-95 transition-all border border-transparent ${
            darkMode ? 'bg-neutral-900 text-neutral-200 hover:bg-neutral-800' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
          title="Reset Zoom to Fit"
        >
          {Math.round(zoom * 100)}%
        </button>
      </div>

      <div className={`w-px h-6 mx-3 ${darkMode ? 'bg-neutral-800' : 'bg-neutral-200'}`} />

      {/* Input Mode Toggle */}
      <div className={`flex items-center rounded-full p-1 gap-1 ${darkMode ? 'bg-neutral-900' : 'bg-neutral-100'}`}>
        <button
          onClick={() => setInputMode('stylus')}
          className={`p-1.5 rounded-full transition-all ${
            inputMode === 'stylus' 
              ? (darkMode ? 'bg-neutral-800 text-blue-400 shadow-sm border border-neutral-700/50' : 'bg-white text-blue-600 shadow-sm border border-neutral-200') 
              : (darkMode ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-500 hover:text-neutral-800')
          }`}
          title="Stylus Mode"
        >
          <PenTool size={16} />
        </button>
        <button
          onClick={() => setInputMode('finger')}
          className={`p-1.5 rounded-full transition-all ${
            inputMode === 'finger' 
              ? (darkMode ? 'bg-neutral-800 text-blue-400 shadow-sm border border-neutral-700/50' : 'bg-white text-blue-600 shadow-sm border border-neutral-200') 
              : (darkMode ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-500 hover:text-neutral-800')
          }`}
          title="Finger Mode"
        >
          <Pointer size={16} />
        </button>
      </div>

      <div className={`w-px h-6 mx-3 ${darkMode ? 'bg-neutral-800' : 'bg-neutral-200'}`} />

      {/* Pressure Toggle */}
      <button
        onClick={() => setPressureEnabled(!pressureEnabled)}
        className={`p-2 rounded-full transition-all ${
          pressureEnabled 
            ? (darkMode ? 'text-blue-400 bg-blue-500/10' : 'text-blue-600 bg-blue-50') 
            : (darkMode ? 'text-neutral-500 hover:bg-neutral-900' : 'text-neutral-400 hover:bg-neutral-100')
        }`}
        title={pressureEnabled ? "Pressure ON" : "Pressure OFF"}
      >
        {pressureEnabled ? <Droplets size={20} /> : <Minus size={20} />}
      </button>

      <div className={`w-px h-6 mx-3 ${darkMode ? 'bg-neutral-800' : 'bg-neutral-200'}`} />

      {/* Background Selector */}
      <div className="relative">
        <button 
          onClick={() => { setShowBgMenu(!showBgMenu); setShowColorMenu(false); setShowEraserMenu(false); }}
          className={`p-2 rounded-full transition-colors flex items-center gap-1 ${
            showBgMenu 
              ? (darkMode ? 'bg-neutral-900' : 'bg-neutral-100') 
              : (darkMode ? 'hover:bg-neutral-900' : 'hover:bg-neutral-100')
          }`}
        >
          <Grid size={20} />
          <ChevronDown size={14} className={`transition-transform ${showBgMenu ? 'rotate-180' : ''}`} />
        </button>
        {showBgMenu && (
          <div className={`absolute top-full mt-4 left-0 border rounded-3xl p-2 shadow-2xl min-w-[180px] toolbar-popover z-[101] ${
            darkMode ? 'bg-neutral-900 border-neutral-850 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-800'
          }`}>
            {bgOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => { setBackground(opt.id); setShowBgMenu(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl transition-colors text-sm ${
                  background === opt.id 
                    ? (darkMode ? 'bg-blue-500/10 text-blue-400 font-bold' : 'bg-blue-50 text-blue-600 font-bold') 
                    : (darkMode ? 'hover:bg-neutral-800/50 text-neutral-300' : 'hover:bg-neutral-100 text-neutral-700')
                }`}
              >
                <opt.icon size={16} className={background === opt.id ? 'text-blue-500' : 'text-neutral-500'} />
                <span className="flex-1 text-left font-medium">{opt.label}</span>
                {background === opt.id && <Check size={14} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`w-px h-6 mx-2 ${darkMode ? 'bg-neutral-800' : 'bg-neutral-200'}`} />

      {/* Tools */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setTool('pen')}
          className={`p-2.5 rounded-full transition-all border-2 ${
            activeTool === 'pen' 
              ? 'bg-blue-500 text-white border-blue-400 shadow-lg scale-110' 
              : (darkMode ? 'hover:bg-neutral-900 border-transparent text-neutral-300' : 'hover:bg-neutral-100 border-transparent text-neutral-600')
          }`}
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
            className={`p-2.5 rounded-full transition-all border-2 flex items-center gap-1 ${
              activeTool === 'eraser' 
                ? 'bg-blue-500 text-white border-blue-400 shadow-lg scale-110' 
                : (darkMode ? 'hover:bg-neutral-900 border-transparent text-neutral-300' : 'hover:bg-neutral-100 border-transparent text-neutral-600')
            }`}
            title="Eraser"
          >
            <Eraser size={18} />
            {activeTool === 'eraser' && <ChevronDown size={14} />}
          </button>
          {showEraserMenu && activeTool === 'eraser' && (
            <div className={`absolute top-full mt-4 left-1/2 -translate-x-1/2 border rounded-2xl p-2 shadow-2xl min-w-[120px] z-[101] ${
              darkMode ? 'bg-neutral-900 border-neutral-850 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-800'
            }`}>
              {eraserSizes.map((s) => (
                <button
                  key={s.value}
                  onClick={() => { setEraserRadius(s.value); setShowEraserMenu(false); }}
                  className={`w-full flex items-center justify-between px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                    eraserRadius === s.value 
                      ? 'bg-blue-500 text-white shadow-sm' 
                      : (darkMode ? 'hover:bg-neutral-850 text-neutral-300' : 'hover:bg-neutral-100 text-neutral-600')
                  }`}
                >
                  {s.label}
                  {eraserRadius === s.value && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`w-px h-6 mx-2 ${darkMode ? 'bg-neutral-800' : 'bg-neutral-200'}`} />

      {/* Color Picker / Width */}
      <div className="relative">
        <button 
          onClick={() => { setShowColorMenu(!showColorMenu); setShowBgMenu(false); setShowEraserMenu(false); }}
          className={`p-1.5 rounded-full transition-colors flex items-center gap-1.5 ${
            showColorMenu 
              ? (darkMode ? 'bg-neutral-900' : 'bg-neutral-100') 
              : (darkMode ? 'hover:bg-neutral-900' : 'hover:bg-neutral-100')
          }`}
        >
          <div 
            className="w-7 h-7 rounded-full border-2 border-white dark:border-neutral-800 shadow-inner" 
            style={{ backgroundColor: penColor }}
          />
          <ChevronDown size={14} className={`transition-transform ${showColorMenu ? 'rotate-180' : ''}`} />
        </button>
        {showColorMenu && (
          <div className={`absolute top-full mt-4 left-1/2 -translate-x-1/2 border rounded-3xl p-5 shadow-2xl min-w-[240px] toolbar-popover z-[101] ${
            darkMode ? 'bg-neutral-900 border-neutral-850 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-800'
          }`}>
            <div className="grid grid-cols-4 gap-3 mb-6">
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => { setPenColor(c); setShowColorMenu(false); }}
                  className={`w-10 h-10 rounded-full border-4 transition-all hover:scale-110 flex items-center justify-center ${
                    penColor === c 
                      ? (darkMode ? 'border-blue-400 shadow-md' : 'border-blue-500 shadow-md') 
                      : 'border-transparent shadow-sm'
                  }`}
                  style={{ backgroundColor: c }}
                >
                   {penColor === c && <Check size={16} className={c === '#ffffff' || c === DARK_DEFAULT ? 'text-black' : 'text-white'} />}
                </button>
              ))}
            </div>
            
            <div className="space-y-3">
              <p className={`text-[10px] uppercase font-black tracking-wider px-1 ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>Pen Size</p>
              <div className="flex gap-1">
                {widths.map((w) => (
                  <button
                    key={w.value}
                    onClick={() => { setPenWidth(w.value); setShowColorMenu(false); }}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                      penWidth === w.value 
                        ? 'bg-blue-500 text-white' 
                        : (darkMode ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300' : 'bg-neutral-105 hover:bg-neutral-200 text-neutral-700')
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={`w-px h-6 mx-2 ${darkMode ? 'bg-neutral-800' : 'bg-neutral-200'}`} />

      {/* Undo/Redo */}
      <div className="flex items-center gap-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`p-2 rounded-full transition-colors disabled:opacity-25 ${
            canUndo 
              ? (darkMode ? 'hover:bg-neutral-900 text-neutral-100' : 'hover:bg-neutral-100 text-neutral-800') 
              : 'text-neutral-400'
          }`}
        >
          <Undo2 size={20} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`p-2 rounded-full transition-colors disabled:opacity-25 ${
            canRedo 
              ? (darkMode ? 'hover:bg-neutral-900 text-neutral-100' : 'hover:bg-neutral-100 text-neutral-800') 
              : 'text-neutral-400'
          }`}
        >
          <Redo2 size={20} />
        </button>
      </div>

      <div className={`w-px h-6 mx-2 ${darkMode ? 'bg-neutral-800' : 'bg-neutral-200'}`} />

      {/* Dark Mode */}
      <button
        onClick={() => setDarkMode(!darkMode)}
        className={`p-2 rounded-full transition-colors ${
          darkMode ? 'hover:bg-neutral-900 text-yellow-400' : 'hover:bg-neutral-100 text-neutral-700'
        }`}
      >
        {darkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>

    </div>
  )
}
