import Dexie, { type Table } from 'dexie'
import type { Notebook } from '@/types/notebook'
import type { Page } from '@/types/page'
import type { Stroke } from '@/types/stroke'
import type { SyncQueueItem } from '@/types/sync'

class NotesDatabase extends Dexie {
  notebooks!: Table<Notebook>
  pages!: Table<Page>
  strokes!: Table<Stroke>
  syncQueue!: Table<SyncQueueItem>

  constructor() {
    super('NotesAppDB')
    this.version(1).stores({
      notebooks: 'id, updatedAt',
      pages: 'id, notebookId, updatedAt',
      strokes: 'id, pageId, createdAt',
      syncQueue: '++id, pageId, status, createdAt',
    })
  }
}

export const db = new NotesDatabase()
export type { Notebook, Page, Stroke, SyncQueueItem }
