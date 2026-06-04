import type { Stroke } from '@/types/stroke'
import type { YjsPageSession } from '@/crdt/yjsSetup'
import { addStrokeToDoc, deleteStrokesFromDoc } from '@/crdt/yjsSetup'

export type Action = 
  | { type: 'ADD_STROKE'; stroke: Stroke }
  | { type: 'ERASE_STROKES'; strokes: Stroke[] }

const A4_HEIGHT_WORLD = 1122

export class UndoRedoStack {
  private undoStack: Action[] = []
  private redoStack: Action[] = []
  private strokes: Stroke[] = []
  private sessions: Map<string, YjsPageSession> = new Map()
  private pageIdsOrdered: string[] = []
  private onChange: (strokes: Stroke[], action?: Action) => void

  constructor(initialStrokes: Stroke[], onChange: (strokes: Stroke[], action?: Action) => void) {
    this.strokes = [...initialStrokes]
    this.onChange = onChange
  }

  setSession(session: YjsPageSession | null, pageId?: string) {
    if (!session || !pageId) {
      this.sessions.clear()
      this.pageIdsOrdered = []
      this.strokes = []
    } else {
      this.sessions.clear()
      this.sessions.set(pageId, session)
      this.pageIdsOrdered = [pageId]
    }
    this.syncStrokes()
  }

  setSessions(sessions: Map<string, YjsPageSession>, pageIdsOrdered: string[]) {
    this.sessions = sessions
    this.pageIdsOrdered = pageIdsOrdered
    this.syncStrokes()
  }

  syncStrokes() {
    const allStrokes: Stroke[] = []
    if (this.sessions.size > 0) {
      for (const session of this.sessions.values()) {
        allStrokes.push(...session.strokesArray.toArray())
      }
      this.strokes = allStrokes.sort((a, b) => a.createdAt - b.createdAt)
    }
    return this.strokes
  }

  push(action: Action) {
    if (this.sessions.size > 0 && this.pageIdsOrdered.length > 0) {
      if (action.type === 'ADD_STROKE') {
        const pageIndex = Math.max(0, Math.floor(action.stroke.bbox.minY / A4_HEIGHT_WORLD))
        // Fallback to last page if pageIndex exceeds the bounds
        const pageId = this.pageIdsOrdered[Math.min(pageIndex, this.pageIdsOrdered.length - 1)]
        const session = this.sessions.get(pageId)
        if (session) {
          addStrokeToDoc(session.doc, session.strokesArray, action.stroke)
        }
      } else if (action.type === 'ERASE_STROKES') {
        const strokesByPage = new Map<string, Stroke[]>()
        for (const stroke of action.strokes) {
          const pageIndex = Math.max(0, Math.floor(stroke.bbox.minY / A4_HEIGHT_WORLD))
          const pageId = this.pageIdsOrdered[Math.min(pageIndex, this.pageIdsOrdered.length - 1)]
          if (pageId) {
            if (!strokesByPage.has(pageId)) strokesByPage.set(pageId, [])
            strokesByPage.get(pageId)!.push(stroke)
          }
        }
        for (const [pageId, strokes] of strokesByPage.entries()) {
          const session = this.sessions.get(pageId)
          if (session) {
            const ids = strokes.map(s => s.id)
            deleteStrokesFromDoc(session.doc, session.strokesArray, ids)
          }
        }
      }
      this.syncStrokes()
      this.onChange(this.strokes, action)
    } else {
      this.applyAction(action)
      this.undoStack.push(action)
      this.redoStack = []
      this.onChange(this.strokes, action)
    }
  }

  undo() {
    if (this.sessions.size > 0) {
      if (this.strokes.length === 0) return
      // Find the last stroke
      const lastStroke = this.strokes[this.strokes.length - 1]
      const pageIndex = Math.max(0, Math.floor(lastStroke.bbox.minY / A4_HEIGHT_WORLD))
      const pageId = this.pageIdsOrdered[Math.min(pageIndex, this.pageIdsOrdered.length - 1)]
      const session = this.sessions.get(pageId)
      
      if (session && session.undoManager.canUndo()) {
        session.undoManager.undo()
        this.syncStrokes()
        this.onChange(this.strokes)
      } else {
        // Try any other session that can undo
        for (const s of this.sessions.values()) {
          if (s.undoManager.canUndo()) {
            s.undoManager.undo()
            this.syncStrokes()
            this.onChange(this.strokes)
            return
          }
        }
      }
    } else {
      const action = this.undoStack.pop()
      if (!action) return
      
      this.revertAction(action)
      this.redoStack.push(action)
      this.onChange(this.strokes)
    }
  }

  redo() {
    if (this.sessions.size > 0) {
      for (const session of this.sessions.values()) {
        if (session.undoManager.canRedo()) {
          session.undoManager.redo()
          this.syncStrokes()
          this.onChange(this.strokes)
          return
        }
      }
    } else {
      const action = this.redoStack.pop()
      if (!action) return
      
      this.applyAction(action)
      this.undoStack.push(action)
      this.onChange(this.strokes)
    }
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
    if (this.sessions.size > 0) {
      for (const s of this.sessions.values()) {
        if (s.undoManager.canUndo()) return true
      }
      return false
    }
    return this.undoStack.length > 0
  }

  canRedo() {
    if (this.sessions.size > 0) {
      for (const s of this.sessions.values()) {
        if (s.undoManager.canRedo()) return true
      }
      return false
    }
    return this.redoStack.length > 0
  }
}
