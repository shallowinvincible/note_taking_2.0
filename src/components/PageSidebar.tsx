import React, { useEffect, useState } from 'react'
import type { Page } from '@/types/page'
import type { Stroke } from '@/types/stroke'
import { db } from '@/storage/db'
import getStroke from 'perfect-freehand'
import { getSvgPathFromStroke } from '@/canvas/StrokeEngine'
import { createPage, deletePage, listPages } from '@/storage/pages'
import { useNotebookStore } from '@/store/notebookStore'
import { useCanvasStore } from '@/store/canvasStore'
import { useToolStore } from '@/store/toolStore'
import { 
  Plus, 
  Trash2, 
  ChevronLeft, 
  ChevronRight,
  File,
  Layers,
  Sparkles
} from 'lucide-react'

export function PageSidebar({
  isOpen,
  onClose,
  onSelectPage
}: {
  isOpen: boolean
  onClose: () => void
  onSelectPage?: (page: Page) => void
}) {
  const { activeNotebook, activePage, pages, setPages, setActivePage } = useNotebookStore()
  const activePageIndex = useCanvasStore(state => state.activePageIndex)
  const { background } = useToolStore()

  const refreshPages = async () => {
    if (!activeNotebook) return
    const list = await listPages(activeNotebook.id)
    setPages(list)
    return list
  }

  const handleAddPage = async () => {
    if (!activeNotebook) return
    // Default background is the current background tool selection
    const newPage = await createPage(activeNotebook.id, background)
    const list = await refreshPages()
    
    // Switch to the newly created page
    if (newPage && list) {
      if (onSelectPage) onSelectPage(newPage)
      else handleSelectPage(newPage)
    }
  }

  const handleDeletePage = async (pageId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (pages.length <= 1) {
      alert('A notebook must have at least one page.')
      return
    }
    if (confirm('Are you sure you want to delete this page? All drawings on this page will be permanently lost.')) {
      await deletePage(pageId)
      const list = await refreshPages()
      
      // If we deleted the active page, switch to another page
      if (activePage?.id === pageId && list && list.length > 0) {
        // Try to switch to the page at the same pageNumber, or the last page
        const deletedNumber = activePage.pageNumber
        const nextActive = list.find(p => p.pageNumber === deletedNumber) || list[list.length - 1]
        if (onSelectPage) onSelectPage(nextActive)
        else handleSelectPage(nextActive)
      }
    }
  }

  const handleSelectPage = (page: Page) => {
    if (onSelectPage) {
      onSelectPage(page)
      return
    }
    setActivePage(page)
    // Synchronize stores with the page configuration
    const { setBackground } = useToolStore.getState()
    setBackground(page.background)
  }

  if (!activeNotebook) return null

  return (
    <>
      {/* Sidebar Panel */}
      <div 
        className={`fixed top-0 left-0 h-full w-80 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-r border-neutral-200 dark:border-neutral-800 z-50 flex flex-col transition-transform duration-300 ease-out shadow-2xl ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Sidebar Header */}
        <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-500" />
            <h2 className="font-extrabold text-neutral-800 dark:text-neutral-100 text-lg">
              Notebook Pages
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Thumbnail/Page List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {pages.map((p, index) => {
            const isActive = activePageIndex === index + 1
            return (
              <div
                key={p.id}
                onClick={() => handleSelectPage(p)}
                className={`group relative flex items-center gap-4 p-3 rounded-2xl cursor-pointer transition-all duration-200 ${isActive ? 'bg-blue-50/80 dark:bg-blue-950/20 border border-blue-500/30' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/40 border border-transparent'}`}
              >
                {/* Styled Document Card representation */}
                <div className={`w-16 h-20 rounded-lg flex flex-col justify-between p-2 shadow-sm border ${isActive ? 'bg-white dark:bg-neutral-950 border-blue-400' : 'bg-neutral-50 dark:bg-neutral-950 border-neutral-300 dark:border-neutral-800'}`}>
                  <span className="text-[10px] font-black font-mono text-neutral-400 dark:text-neutral-600">
                    P. {p.pageNumber}
                  </span>
                  
                  {/* Miniature Background representation */}
                  <div className="flex-1 flex flex-col justify-center gap-1 my-1 relative">
                    {p.background === 'ruled' && (
                      <div className="space-y-1">
                        <div className="h-[1px] bg-neutral-200 dark:bg-neutral-800 w-full" />
                        <div className="h-[1px] bg-neutral-200 dark:bg-neutral-800 w-full" />
                        <div className="h-[1px] bg-neutral-200 dark:bg-neutral-800 w-full" />
                      </div>
                    )}
                    {p.background === 'dotted' && (
                      <div className="grid grid-cols-3 gap-1 justify-items-center">
                        <div className="w-[1.5px] h-[1.5px] bg-neutral-300 dark:bg-neutral-700 rounded-full" />
                        <div className="w-[1.5px] h-[1.5px] bg-neutral-300 dark:bg-neutral-700 rounded-full" />
                        <div className="w-[1.5px] h-[1.5px] bg-neutral-300 dark:bg-neutral-700 rounded-full" />
                      </div>
                    )}
                    {p.background === 'grid' && (
                      <div className="w-full h-full border border-neutral-200 dark:border-neutral-800 rounded opacity-60" />
                    )}
                    {p.background === 'blank' && (
                      <div className="w-full h-full rounded" />
                    )}
                    {p.background === 'cornell' && (
                      <div className="w-full h-full flex flex-col border border-neutral-200 dark:border-neutral-800 rounded opacity-60">
                        <div className="h-2 border-b border-neutral-200 dark:border-neutral-800" />
                        <div className="flex-1 flex">
                          <div className="w-3 border-r border-neutral-200 dark:border-neutral-800" />
                          <div className="flex-1" />
                        </div>
                      </div>
                    )}
                    
                    {/* Live SVG Preview of Strokes */}
                    <PageThumbnail page={p} index={index} />
                  </div>
                  
                  <span className="text-[7px] text-neutral-400 font-mono text-center">
                    {Math.round(p.pageHeight)} px
                  </span>
                </div>

                {/* Info and delete actions */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-neutral-700 dark:text-neutral-200 truncate">
                    Page {p.pageNumber}
                  </p>
                  <p className="text-[10px] text-neutral-400 dark:text-neutral-500 capitalize font-medium mt-0.5">
                    {p.background} background
                  </p>
                </div>

                {/* Delete Page Button */}
                {pages.length > 1 && (
                  <button
                    onClick={(e) => handleDeletePage(p.id, e)}
                    className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete Page"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Sidebar Footer with Add Page Action */}
        <div className="p-5 border-t border-neutral-200 dark:border-neutral-800">
          <button
            onClick={handleAddPage}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm rounded-2xl shadow-lg shadow-blue-500/10 active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            Add New Page
          </button>
        </div>
      </div>
      
      {/* Click-to-close Backdrop overlay */}
      {isOpen && (
        <div 
          onClick={onClose}
          className="fixed inset-0 bg-black/10 backdrop-blur-[1px] z-40"
        />
      )}
    </>
  )
}

// Sub-component to render live SVG preview of standard Dexie-persisted strokes
function PageThumbnail({ page, index }: { page: Page; index: number }) {
  const [strokes, setStrokes] = useState<Stroke[]>([])
  
  useEffect(() => {
    let active = true
    const fetchStrokes = async () => {
      try {
        const items = await db.strokes.where('pageId').equals(page.id).toArray()
        if (active) setStrokes(items)
      } catch (err) {
        // ignore Dexie close errors
      }
    }
    fetchStrokes()
    // Poll strokes if the sidebar is open
    const interval = setInterval(fetchStrokes, 2500)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [page.id])

  if (strokes.length === 0) return null

  return (
    <svg 
      className="absolute inset-0 w-full h-full pointer-events-none opacity-80" 
      viewBox={`0 ${index * 1122} 795 1122`}
      preserveAspectRatio="xMidYMid slice"
    >
      {strokes.map(stroke => {
         const points = stroke.points.map(p => [p.x, p.y, p.pressure])
         const outline = getStroke(points, { 
           size: stroke.width, 
           thinning: 0.5,
           smoothing: 0.5,
           streamline: 0.5,
           last: true 
         })
         if (outline.length === 0) return null
         const pathData = getSvgPathFromStroke(outline)
         return <path key={stroke.id} d={pathData} fill={stroke.color} />
      })}
    </svg>
  )
}

