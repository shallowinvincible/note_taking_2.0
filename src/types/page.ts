import type { Background } from './stroke'

export interface Page {
  id: string
  notebookId: string
  pageNumber: number // 1-indexed page ordering within the notebook
  background: Background
  pageHeight: number
  createdAt: number
  updatedAt: number
}
