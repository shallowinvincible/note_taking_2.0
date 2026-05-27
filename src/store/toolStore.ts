import { create } from 'zustand'
import type { StrokeTool } from '@/types/stroke'

interface ToolStore {
  activeTool: StrokeTool
  penColor: string
  penWidth: number
  eraserWidth: number
  setTool: (tool: StrokeTool) => void
  setPenColor: (color: string) => void
  setPenWidth: (width: number) => void
  setEraserWidth: (width: number) => void
}

export const useToolStore = create<ToolStore>((set) => ({
  activeTool: 'pen',
  penColor: '#1a1a1a',
  penWidth: 4,
  eraserWidth: 24,
  setTool: (tool) => set({ activeTool: tool }),
  setPenColor: (color) => set({ penColor: color }),
  setPenWidth: (width) => set({ penWidth: width }),
  setEraserWidth: (width) => set({ eraserWidth: width }),
}))
