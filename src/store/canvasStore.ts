import { create } from 'zustand'

interface CanvasStore {
  zoomLevel: number
  panX: number
  panY: number
  canUndo: boolean
  canRedo: boolean
  setTransform: (zoom: number, panX: number, panY: number) => void
  setUndoRedo: (canUndo: boolean, canRedo: boolean) => void
}

/**
 * Zustand store is for React UI display only (toolbar zoom badge, undo button states).
 * The canvas engine holds its own mutable TransformSystem and UndoRedoStack
 * to avoid any React re-renders during a stroke.
 */
export const useCanvasStore = create<CanvasStore>((set) => ({
  zoomLevel: 1.0,
  panX: 0,
  panY: 0,
  canUndo: false,
  canRedo: false,
  setTransform: (zoomLevel, panX, panY) => set({ zoomLevel, panX, panY }),
  setUndoRedo: (canUndo, canRedo) => set({ canUndo, canRedo }),
}))
