import { create } from 'zustand'

interface CanvasState {
  zoom: number
  panX: number
  panY: number
  pageWidth: number
  pageHeight: number
  canUndo: boolean
  canRedo: boolean
  
  setTransform: (zoom: number, panX: number, panY: number) => void
  setPageHeight: (height: number) => void
  setUndoRedo: (undo: boolean, redo: boolean) => void
}

export const useCanvasStore = create<CanvasState>((set) => ({
  zoom: 1.0,
  panX: 0,
  panY: 0,
  pageWidth: 795, // A4 Portrait at 96 DPI is ~794px, user said 795
  pageHeight: 1122,
  canUndo: false,
  canRedo: false,

  setTransform: (zoom, panX, panY) => set({ zoom, panX, panY }),
  setPageHeight: (pageHeight) => set({ pageHeight }),
  setUndoRedo: (canUndo, canRedo) => set({ canUndo, canRedo })
}))
