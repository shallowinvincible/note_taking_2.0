import * as Y from 'yjs'
import type { Stroke } from '@/types/stroke'

// Dynamic import for y-indexeddb since it requires window
let IndexeddbPersistence: any = null
if (typeof window !== 'undefined') {
  IndexeddbPersistence = require('y-indexeddb').IndexeddbPersistence
}

export interface YjsPageSession {
  doc: Y.Doc
  persistence: any
  strokesArray: Y.Array<Stroke>
  undoManager: Y.UndoManager
  syncedPromise: Promise<void>
}

export function createPageSession(pageId: string): YjsPageSession {
  const doc = new Y.Doc()
  const strokesArray = doc.getArray<Stroke>('strokes')
  
  // Set up UndoManager on the strokes array
  const undoManager = new Y.UndoManager(strokesArray, {
    // Only capture changes that affect the strokes array
    trackedOrigins: new Set([doc.clientID]),
  })

  let persistence: any = null
  let resolveSynced: () => void = () => {}
  const syncedPromise = new Promise<void>((resolve) => {
    resolveSynced = resolve
  })

  if (typeof window !== 'undefined' && IndexeddbPersistence) {
    persistence = new IndexeddbPersistence(`page-${pageId}`, doc)
    
    // Check if already synced or wait for it
    if (persistence.synced) {
      resolveSynced()
    } else {
      persistence.once('synced', () => {
        resolveSynced()
      })
    }
  } else {
    // SSR or fallback
    resolveSynced()
  }

  return {
    doc,
    persistence,
    strokesArray,
    undoManager,
    syncedPromise,
  }
}

export function addStrokeToDoc(doc: Y.Doc, strokesArray: Y.Array<Stroke>, stroke: Stroke) {
  doc.transact(() => {
    strokesArray.push([stroke])
  }, 'local-add')
}

export function deleteStrokeFromDoc(doc: Y.Doc, strokesArray: Y.Array<Stroke>, strokeId: string) {
  doc.transact(() => {
    const index = strokesArray.toArray().findIndex((s) => s.id === strokeId)
    if (index !== -1) {
      strokesArray.delete(index, 1)
    }
  }, 'local-erase')
}

export function deleteStrokesFromDoc(doc: Y.Doc, strokesArray: Y.Array<Stroke>, strokeIds: string[]) {
  doc.transact(() => {
    const idSet = new Set(strokeIds)
    const arr = strokesArray.toArray()
    // Delete items from back to front to avoid index shifting problems
    for (let i = arr.length - 1; i >= 0; i--) {
      if (idSet.has(arr[i].id)) {
        strokesArray.delete(i, 1)
      }
    }
  }, 'local-erase')
}

export function applyRemoteUpdate(doc: Y.Doc, update: Uint8Array) {
  Y.applyUpdate(doc, update)
}

export function encodeDocState(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc)
}
