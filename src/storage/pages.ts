import { db } from './db'
import type { Page } from '@/types/page'
import type { Background } from '@/types/stroke'
import { genId } from '@/types/stroke'

export async function createPage(
  notebookId: string,
  background: Background = 'ruled',
  pageHeight: number = 1122
): Promise<Page> {
  const now = Date.now()
  return db.transaction('rw', [db.notebooks, db.pages], async () => {
    // Count existing pages in the notebook to determine the order pageNumber
    const count = await db.pages.where('notebookId').equals(notebookId).count()
    const page: Page = {
      id: genId(),
      notebookId,
      pageNumber: count + 1,
      background,
      pageHeight,
      createdAt: now,
      updatedAt: now,
    }
    await db.pages.add(page)
    // Update the notebook's updatedAt timestamp
    await db.notebooks.update(notebookId, { updatedAt: now })
    return page
  })
}

export async function listPages(notebookId: string): Promise<Page[]> {
  // Return pages ordered by pageNumber
  const pages = await db.pages.where('notebookId').equals(notebookId).toArray()
  return pages.sort((a, b) => a.pageNumber - b.pageNumber)
}

export async function updatePageBackground(pageId: string, background: Background): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', [db.notebooks, db.pages], async () => {
    const page = await db.pages.get(pageId)
    if (!page) return
    await db.pages.update(pageId, { background, updatedAt: now })
    await db.notebooks.update(page.notebookId, { updatedAt: now })
  })
}

export async function updatePageHeight(pageId: string, pageHeight: number): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', [db.notebooks, db.pages], async () => {
    const page = await db.pages.get(pageId)
    if (!page) return
    await db.pages.update(pageId, { pageHeight, updatedAt: now })
    await db.notebooks.update(page.notebookId, { updatedAt: now })
  })
}

export async function deletePage(pageId: string): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', [db.notebooks, db.pages, db.strokes], async () => {
    const page = await db.pages.get(pageId)
    if (!page) return

    const { notebookId, pageNumber } = page

    // Delete strokes of this page
    await db.strokes.where('pageId').equals(pageId).delete()

    // Delete the page itself
    await db.pages.delete(pageId)

    // Re-order remaining pages of this notebook
    const remainingPages = await db.pages.where('notebookId').equals(notebookId).toArray()
    remainingPages.sort((a, b) => a.pageNumber - b.pageNumber)
    for (let i = 0; i < remainingPages.length; i++) {
      if (remainingPages[i].pageNumber !== i + 1) {
        await db.pages.update(remainingPages[i].id, { pageNumber: i + 1 })
      }
    }

    // Update notebook updatedAt
    await db.notebooks.update(notebookId, { updatedAt: now })
  })
}
