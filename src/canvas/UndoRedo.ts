import type { Stroke } from '@/types/stroke'

export type UndoRedoCallback = (strokes: Stroke[]) => void

/**
 * UndoRedoStack — in-memory only, no IndexedDB.
 *
 * The committed strokes array is the single source of truth.
 * Undo pops the last stroke onto a redo stack.
 * Redo pops from the redo stack back into committed.
 */
export class UndoRedoStack {
  private committed: Stroke[] = []
  private redoStack: Stroke[] = []
  private onChange: UndoRedoCallback

  constructor(onChange: UndoRedoCallback) {
    this.onChange = onChange
  }

  push(stroke: Stroke): void {
    this.committed.push(stroke)
    // Any new stroke collapses the redo branch
    this.redoStack = []
    this.onChange(this.committed)
  }

  undo(): void {
    if (this.committed.length === 0) return
    const last = this.committed.pop()!
    this.redoStack.push(last)
    this.onChange(this.committed)
  }

  redo(): void {
    if (this.redoStack.length === 0) return
    const stroke = this.redoStack.pop()!
    this.committed.push(stroke)
    this.onChange(this.committed)
  }

  getStrokes(): Stroke[] {
    return this.committed
  }

  canUndo(): boolean {
    return this.committed.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  clear(): void {
    this.committed = []
    this.redoStack = []
    this.onChange(this.committed)
  }
}
