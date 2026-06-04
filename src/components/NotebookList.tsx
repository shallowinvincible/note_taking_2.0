import React, { useState, useEffect, useCallback } from 'react'
import { listNotebooks, createNotebook, renameNotebook, deleteNotebook } from '@/storage/notebooks'
import { db } from '@/storage/db'
import type { Notebook } from '@/types/notebook'
import { useNotebookStore } from '@/store/notebookStore'
import { 
  Book, 
  Plus, 
  Trash2, 
  Edit3, 
  Search, 
  Calendar, 
  BookOpen, 
  Check, 
  X,
  FileText
} from 'lucide-react'

export function NotebookList({ 
  onSelectNotebook 
}: { 
  onSelectNotebook: (notebook: Notebook) => void 
}) {
  const { notebooks, setNotebooks } = useNotebookStore()
  const [search, setSearch] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({})

  // Load notebooks and page counts from Dexie
  const loadData = useCallback(async () => {
    const list = await listNotebooks()
    setNotebooks(list)

    // Fetch page counts for all notebooks
    const counts: Record<string, number> = {}
    for (const nb of list) {
      const count = await db.pages.where('notebookId').equals(nb.id).count()
      counts[nb.id] = count
    }
    setPageCounts(counts)
  }, [setNotebooks])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    const nb = await createNotebook(newTitle.trim())
    setNewTitle('')
    setIsCreating(false)
    await loadData()
    onSelectNotebook(nb)
  }

  const handleRename = async (id: string) => {
    if (!editTitle.trim()) return
    await renameNotebook(id, editTitle.trim())
    setEditingId(null)
    setEditTitle('')
    loadData()
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Are you sure you want to delete this notebook? All pages and handwriting will be permanently deleted.')) {
      await deleteNotebook(id)
      loadData()
    }
  }

  const filteredNotebooks = notebooks.filter(nb => 
    nb.title.toLowerCase().includes(search.toLowerCase())
  )

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    })
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-12 select-none">
      {/* Dashboard Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-500 dark:from-blue-400 dark:to-indigo-300 bg-clip-text text-transparent">
            My Notebooks
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-2 text-sm">
            Local-first, encrypted handwritten notes.
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500 w-4 h-4" />
            <input
              type="text"
              placeholder="Search notebooks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2.5 w-64 bg-white/70 dark:bg-neutral-900/60 backdrop-blur border border-neutral-200 dark:border-neutral-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-blue-500/30 transition-all text-neutral-800 dark:text-neutral-100"
            />
          </div>

          {/* New Notebook Button */}
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm rounded-2xl shadow-lg shadow-blue-500/20 dark:shadow-blue-500/10 active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            New Notebook
          </button>
        </div>
      </div>

      {/* Creation Modal / Form Overlay */}
      {isCreating && (
        <div className="fixed inset-0 bg-neutral-950/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <form 
            onSubmit={handleCreate}
            className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-6 shadow-2xl scale-up-animation"
          >
            <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 mb-4">
              Create Notebook
            </h2>
            <input
              type="text"
              autoFocus
              placeholder="Notebook title..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-neutral-800 dark:text-neutral-100 mb-6"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setIsCreating(false); setNewTitle(''); }}
                className="px-4 py-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl text-sm font-medium text-neutral-600 dark:text-neutral-400 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-sm rounded-xl shadow-md transition-colors"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Notebooks Grid */}
      {filteredNotebooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 bg-white/40 dark:bg-neutral-900/20 backdrop-blur-sm border border-dashed border-neutral-300 dark:border-neutral-800 rounded-3xl">
          <Book className="w-16 h-16 text-neutral-300 dark:text-neutral-700 stroke-[1.5]" />
          <h3 className="text-lg font-bold text-neutral-700 dark:text-neutral-300 mt-4">
            No notebooks found
          </h3>
          <p className="text-neutral-400 dark:text-neutral-500 text-sm max-w-xs mt-2">
            {search ? "No notebooks match your search query." : "Create your first notebook to start writing private handwritten notes."}
          </p>
          {!search && (
            <button
              onClick={() => setIsCreating(true)}
              className="mt-6 flex items-center gap-2 px-4 py-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-semibold text-sm rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Create Notebook
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredNotebooks.map((nb) => {
            const pageCount = pageCounts[nb.id] || 0
            const isEditing = editingId === nb.id

            return (
              <div
                key={nb.id}
                onClick={() => !isEditing && onSelectNotebook(nb)}
                className="group relative bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800/80 hover:border-blue-500/50 dark:hover:border-blue-500/40 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col justify-between min-h-[190px]"
              >
                {/* Decorative Background Gradient */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 dark:bg-blue-500/10 rounded-bl-full group-hover:scale-125 transition-transform duration-500 pointer-events-none" />

                {/* Notebook Header Info */}
                <div>
                  <div className="flex items-start justify-between">
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-2xl">
                      <BookOpen className="w-6 h-6 stroke-[2]" />
                    </div>
                    
                    {/* Actions Menu */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingId(nb.id)
                          setEditTitle(nb.title)
                        }}
                        className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 transition-colors"
                        title="Rename"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(nb.id, e)}
                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Title / Editing Title */}
                  <div className="mt-5">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="px-2.5 py-1 w-full text-sm font-semibold border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-800 dark:text-neutral-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(nb.id)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                        />
                        <button
                          onClick={() => handleRename(nb.id)}
                          className="p-1 bg-green-500 text-white rounded hover:bg-green-600"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1 bg-neutral-300 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 rounded hover:bg-neutral-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <h3 className="font-bold text-neutral-800 dark:text-neutral-100 text-lg leading-tight truncate">
                        {nb.title}
                      </h3>
                    )}
                  </div>
                </div>

                {/* Footer Details */}
                <div className="mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-400 dark:text-neutral-500 font-medium">
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{pageCount} {pageCount === 1 ? 'page' : 'pages'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatDate(nb.updatedAt)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
