import { create } from 'zustand'
import type { StrokeTool, Background, Stroke } from '@/types/stroke'

export const LIGHT_DEFAULT = '#1a1a1a'
export const DARK_DEFAULT = '#fbfbfb'

interface ToolState {
  activeTool: StrokeTool
  inputMode: 'stylus' | 'finger'
  penColor: string
  penWidth: number
  eraserRadius: number
  pressureEnabled: boolean
  background: Background
  darkMode: boolean

  setTool: (tool: StrokeTool) => void
  setInputMode: (mode: 'stylus' | 'finger') => void
  setPenColor: (color: string) => void
  setPenWidth: (width: number) => void
  setEraserRadius: (radius: number) => void
  setPressureEnabled: (enabled: boolean) => void
  setBackground: (bg: Background) => void
  setDarkMode: (dark: boolean) => void
  hydrate: () => void
}

const isClient = typeof window !== 'undefined'

export const useToolStore = create<ToolState>((set, get) => ({
  activeTool: 'pen',
  inputMode: 'stylus',
  penColor: LIGHT_DEFAULT,
  penWidth: 4,
  eraserRadius: 20,
  pressureEnabled: true,
  background: 'ruled',
  darkMode: false,

  setTool: (activeTool) => set({ activeTool }),
  setInputMode: (inputMode) => {
    set({ inputMode })
    if (isClient) localStorage.setItem('inputMode', inputMode)
  },
  setPenColor: (penColor) => {
    set({ penColor })
    if (isClient) localStorage.setItem('penColor', penColor)
  },
  setPenWidth: (penWidth) => {
    set({ penWidth })
    if (isClient) localStorage.setItem('penWidth', String(penWidth))
  },
  setEraserRadius: (eraserRadius) => {
    set({ eraserRadius })
    if (isClient) localStorage.setItem('eraserRadius', String(eraserRadius))
  },
  setPressureEnabled: (pressureEnabled) => {
    set({ pressureEnabled })
    if (isClient) localStorage.setItem('pressureEnabled', String(pressureEnabled))
  },
  setBackground: (background) => set({ background }),
  setDarkMode: (darkMode) => {
    const prevDark = get().darkMode
    if (prevDark === darkMode) return
    set({ darkMode })
    if (isClient) {
      localStorage.setItem('theme', darkMode ? 'dark' : 'light')
      document.documentElement.classList.toggle('dark', darkMode)
    }
  },
  hydrate: () => {
    if (!isClient) return
    const penColor = localStorage.getItem('penColor')
    const penWidth = localStorage.getItem('penWidth')
    const eraserRadius = localStorage.getItem('eraserRadius')
    const pressureEnabled = localStorage.getItem('pressureEnabled')
    const theme = localStorage.getItem('theme')
    const inputMode = localStorage.getItem('inputMode') as 'stylus' | 'finger'

    const isDark = theme === 'dark' || (theme === null && window.matchMedia('(prefers-color-scheme: dark)').matches)

    set((state) => ({
      penColor: penColor || state.penColor,
      penWidth: penWidth ? Number(penWidth) : state.penWidth,
      eraserRadius: eraserRadius ? Number(eraserRadius) : state.eraserRadius,
      pressureEnabled: pressureEnabled !== 'false',
      darkMode: isDark,
      inputMode: inputMode || 'stylus'
    }))

    if (isDark) {
      document.documentElement.classList.add('dark')
    }
  }
}))

export function invertStrokes(strokes: Stroke[], goingDark: boolean): Stroke[] {
  const from = goingDark ? LIGHT_DEFAULT : DARK_DEFAULT
  const to = goingDark ? DARK_DEFAULT : LIGHT_DEFAULT
  return strokes.map(s => {
    if (s.color === from) {
      return { ...s, color: to }
    }
    return s
  })
}
