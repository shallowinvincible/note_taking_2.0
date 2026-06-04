export type SyncQueueItem = {
  id?: number
  pageId: string
  operation: 'ADD_STROKE' | 'DELETE_STROKE' | 'UPDATE_PAGE' | 'DELETE_PAGE'
  payload: unknown
  status: 'pending' | 'in-progress' | 'failed'
  retries: number
  createdAt: number
}
