import type { Stroke } from '@/types/stroke'

export type Action = 
  | { type: 'ADD_STROKE'; stroke: Stroke }
  | { type: 'ERASE_STROKES'; strokes: Stroke[] }

export class UndoRedoStack {
  private undoStack: Action[] = []
  private redoStack: Action[] = []
  private strokes: Stroke[] = []
  private onChange: (strokes: Stroke[], action?: Action) => void

  constructor(initialStrokes: Stroke[], onChange: (strokes: Stroke[], action?: Action) => void) {
    this.strokes = [...initialStrokes]
    this.onChange = onChange
  }

  push(action: Action) {
    this.applyAction(action)
    this.undoStack.push(action)
    this.redoStack = []
    this.onChange(this.strokes, action)
  }

  undo() {
    const action = this.undoStack.pop()
    if (!action) return
    
    this.revertAction(action)
    this.redoStack.push(action)
    this.onChange(this.strokes) // No action passed means full redraw
  }

  redo() {
    const action = this.redoStack.pop()
    if (!action) return
    
    this.applyAction(action)
    this.undoStack.push(action)
    this.onChange(this.strokes) // No action passed means full redraw
  }

  private applyAction(action: Action) {
    if (action.type === 'ADD_STROKE') {
      this.strokes.push(action.stroke)
    } else if (action.type === 'ERASE_STROKES') {
      const idsToRemove = action.strokes.map(s => s.id)
      this.strokes = this.strokes.filter(s => !idsToRemove.includes(s.id))
    }
  }

  private revertAction(action: Action) {
    if (action.type === 'ADD_STROKE') {
      this.strokes.pop()
    } else if (action.type === 'ERASE_STROKES') {
      this.strokes = [...this.strokes, ...action.strokes].sort((a,b) => a.createdAt - b.createdAt)
    }
  }

  getStrokes() {
    return this.strokes
  }

  canUndo() {
    return this.undoStack.length > 0
  }

  canRedo() {
    return this.redoStack.length > 0
  }
}
