import { db } from './db'
import type { SyncQueueItem } from '@/types/sync'

export async function enqueueSync(
  pageId: string,
  operation: SyncQueueItem['operation'],
  payload: unknown
): Promise<void> {
  const item: SyncQueueItem = {
    pageId,
    operation,
    payload,
    status: 'pending',
    retries: 0,
    createdAt: Date.now(),
  }
  await db.syncQueue.add(item)
}

export async function getPendingSyncs(): Promise<SyncQueueItem[]> {
  return db.syncQueue.where('status').equals('pending').toArray()
}

export async function updateSyncStatus(
  id: number,
  status: SyncQueueItem['status'],
  retries: number
): Promise<void> {
  await db.syncQueue.update(id, { status, retries })
}

export async function deleteSyncItem(id: number): Promise<void> {
  await db.syncQueue.delete(id)
}
