import { create } from 'zustand'
import type { Notebook } from '@/types/notebook'
import type { Page } from '@/types/page'

interface NotebookState {
  notebooks: Notebook[]
  pages: Page[]
  activeNotebook: Notebook | null
  activePage: Page | null
  isAutosaving: boolean
  isDbLoaded: boolean

  setNotebooks: (notebooks: Notebook[]) => void
  setPages: (pages: Page[]) => void
  setActiveNotebook: (notebook: Notebook | null) => void
  setActivePage: (page: Page | null) => void
  setAutosaving: (isAutosaving: boolean) => void
  setDbLoaded: (loaded: boolean) => void
}

export const useNotebookStore = create<NotebookState>((set) => ({
  notebooks: [],
  pages: [],
  activeNotebook: null,
  activePage: null,
  isAutosaving: false,
  isDbLoaded: false,

  setNotebooks: (notebooks) => set({ notebooks }),
  setPages: (pages) => set({ pages }),
  setActiveNotebook: (activeNotebook) => set({ activeNotebook }),
  setActivePage: (activePage) => set({ activePage }),
  setAutosaving: (isAutosaving) => set({ isAutosaving }),
  setDbLoaded: (isDbLoaded) => set({ isDbLoaded }),
}))
