import { create } from 'zustand'
import type { StrokeTool, Background } from '@/types/stroke'

interface ToolState {
  activeTool: StrokeTool
  penColor: string
  penWidth: number
  eraserRadius: number
  background: Background
  darkMode: boolean
  
  setTool: (tool: StrokeTool) => void
  setPenColor: (color: string) => void
  setPenWidth: (width: number) => void
  setEraserRadius: (radius: number) => void
  setBackground: (bg: Background) => void
  setDarkMode: (dark: boolean) => void
  hydrate: () => void // New sync method
}

export const useToolStore = create<ToolState>((set) => ({
  activeTool: 'pen',
  penColor: '#1a1a1a', // Initial static value for safe hydration
  penWidth: 4,
  eraserRadius: 20,
  background: 'ruled',
  darkMode: false,

  setTool: (activeTool) => set({ activeTool }),
  setPenColor: (penColor) => {
    set({ penColor })
    if (typeof window !== 'undefined') localStorage.setItem('penColor', penColor)
  },
  setPenWidth: (penWidth) => {
    set({ penWidth })
    if (typeof window !== 'undefined') localStorage.setItem('penWidth', String(penWidth))
  },
  setEraserRadius: (eraserRadius) => set({ eraserRadius }),
  setBackground: (background) => set({ background }),
  setDarkMode: (darkMode) => {
    set({ darkMode })
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', darkMode ? 'true' : 'false')
      document.documentElement.classList.toggle('dark', darkMode)
    }
  },
  hydrate: () => {
    if (typeof window === 'undefined') return
    const penColor = localStorage.getItem('penColor')
    const penWidth = localStorage.getItem('penWidth')
    const darkMode = localStorage.getItem('darkMode')
    
    set((state) => ({
      penColor: penColor || state.penColor,
      penWidth: penWidth ? Number(penWidth) : state.penWidth,
      darkMode: darkMode === 'true'
    }))
    
    if (darkMode === 'true') {
      document.documentElement.classList.add('dark')
    }
  }
}))
