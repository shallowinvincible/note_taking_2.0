import { db } from './db'
import type { Stroke } from '@/types/stroke'

export async function getStrokes(pageId: string): Promise<Stroke[]> {
  return db.strokes.where('pageId').equals(pageId).sortBy('createdAt')
}

export async function saveStroke(stroke: Stroke): Promise<void> {
  await db.strokes.put(stroke)
}

export async function deleteStroke(id: string): Promise<void> {
  await db.strokes.delete(id)
}

export async function deleteStrokes(ids: string[]): Promise<void> {
  await db.strokes.bulkDelete(ids)
}

export async function saveStrokesBulk(strokes: Stroke[]): Promise<void> {
  if (strokes.length === 0) return
  await db.strokes.bulkPut(strokes)
}

export async function clearStrokesForPage(pageId: string): Promise<void> {
  await db.strokes.where('pageId').equals(pageId).delete()
}
