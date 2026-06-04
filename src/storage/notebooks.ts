import { db } from './db'
import type { Notebook } from '@/types/notebook'
import { genId } from '@/types/stroke'

export async function createNotebook(title: string): Promise<Notebook> {
  const now = Date.now()
  const notebook: Notebook = {
    id: genId(),
    title: title.trim() || 'Untitled Notebook',
    createdAt: now,
    updatedAt: now,
  }
  await db.notebooks.add(notebook)
  return notebook
}

export async function listNotebooks(): Promise<Notebook[]> {
  return db.notebooks.orderBy('updatedAt').reverse().toArray()
}

export async function renameNotebook(id: string, title: string): Promise<void> {
  await db.notebooks.update(id, {
    title: title.trim(),
    updatedAt: Date.now(),
  })
}

export async function deleteNotebook(id: string): Promise<void> {
  // Use a transaction to ensure all associated pages, strokes, etc. are cleaned up
  await db.transaction('rw', [db.notebooks, db.pages, db.strokes], async () => {
    // Get all page IDs associated with this notebook
    const pages = await db.pages.where('notebookId').equals(id).toArray()
    const pageIds = pages.map(p => p.id)

    // Delete strokes of those pages
    if (pageIds.length > 0) {
      await db.strokes.where('pageId').anyOf(pageIds).delete()
      await db.pages.where('notebookId').equals(id).delete()
    }

    // Delete the notebook itself
    await db.notebooks.delete(id)
  })
}
