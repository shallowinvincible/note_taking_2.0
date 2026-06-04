'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useCanvas } from '@/hooks/useCanvas'
import { Toolbar } from '@/components/Toolbar'
import { NotebookList } from '@/components/NotebookList'
import { PageSidebar } from '@/components/PageSidebar'
import { useNotebookStore } from '@/store/notebookStore'
import { useCanvasStore } from '@/store/canvasStore'
import { useToolStore } from '@/store/toolStore'
import { listPages, createPage, updatePageBackground, updatePageHeight } from '@/storage/pages'
import { renameNotebook } from '@/storage/notebooks'
import type { Notebook } from '@/types/notebook'
import type { Page } from '@/types/page'
import {
  ArrowLeft,
  Layers,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  Edit2
} from 'lucide-react'

function DynamicPageCounter({ pagesLength }: { pagesLength: number }) {
  const activePageIndex = useCanvasStore(state => state.activePageIndex)
  const safeIndex = Math.min(pagesLength, Math.max(1, activePageIndex))
  const darkMode = useToolStore(s => s.darkMode)

  return (
    <span className={`px-3 text-xs font-black font-mono ${darkMode ? 'text-neutral-300' : 'text-neutral-750'}`}>
      Page {safeIndex} of {pagesLength}
    </span>
  )
}

export default function Home() {
  const {
    activeNotebook,
    activePage,
    pages,
    isAutosaving,
    setActiveNotebook,
    setActivePage,
    setPages
  } = useNotebookStore()

  const { pageHeight, setPageHeight, setCurrentPageBottom } = useCanvasStore()
  const { background, setBackground, darkMode } = useToolStore()

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleVal, setEditTitleVal] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Call the canvas drawing hook
  const { bgCanvasRef, committedCanvasRef, activeCanvasRef, cursorCanvasRef, undo, redo, fitPage, scrollToPage } = useCanvas()

  // Select a notebook and load its pages
  const handleSelectNotebook = async (notebook: Notebook) => {
    setActiveNotebook(notebook)

    // Fetch pages
    let notebookPages = await listPages(notebook.id)
    if (notebookPages.length === 0) {
      // Automatically create the first page if none exists
      const newPage = await createPage(notebook.id, 'ruled')
      notebookPages = [newPage]
    }

    setPages(notebookPages)
    setPageHeight(notebookPages.length * 1122)
    setCurrentPageBottom(notebookPages.length * 1122)

    // Default to the first page
    const firstPage = notebookPages[0]
    handleSelectPage(firstPage)
  }

  const handleSelectPage = (page: Page) => {
    setActivePage(page)
    setBackground(page.background)
    
    // In continuous scrolling mode, do not shrink the canvas height to a single page's height!
    // Simply scroll to the target page index.
    const idx = pages.findIndex(p => p.id === page.id)
    if (idx >= 0 && scrollToPage) {
      scrollToPage(idx)
    }
  }

  // Handle page pagination (prev/next)
  const handlePrevPage = () => {
    if (pages.length <= 1) return
    const currentY = useCanvasStore.getState().panY
    let currentIndex = Math.max(0, Math.floor(currentY / 1122))
    if (currentIndex > 0) {
      scrollToPage(currentIndex - 1)
      setActivePage(pages[currentIndex - 1])
    }
  }

  const handleNextPage = () => {
    if (pages.length <= 1) return
    const currentY = useCanvasStore.getState().panY
    let currentIndex = Math.max(0, Math.floor(currentY / 1122))
    if (currentIndex < pages.length - 1) {
      scrollToPage(currentIndex + 1)
      setActivePage(pages[currentIndex + 1])
    }
  }

  // Update notebook title in database
  const saveNotebookTitle = async () => {
    if (!activeNotebook || !editTitleVal.trim()) {
      setIsEditingTitle(false)
      return
    }
    await renameNotebook(activeNotebook.id, editTitleVal.trim())
    setActiveNotebook({
      ...activeNotebook,
      title: editTitleVal.trim(),
      updatedAt: Date.now()
    })
    setIsEditingTitle(false)
  }

  // Sync background changes to Dexie
  useEffect(() => {
    if (activePage && background !== activePage.background) {
      updatePageBackground(activePage.id, background).then(() => {
        // Update local pages list
        setPages(pages.map(p => p.id === activePage.id ? { ...p, background } : p))
      })
    }
  }, [background, activePage, pages, setPages])

  // Sync page height changes to Dexie
  useEffect(() => {
    if (activePage && pageHeight !== activePage.pageHeight) {
      updatePageHeight(activePage.id, pageHeight).then(() => {
        // Update local pages list
        setPages(pages.map(p => p.id === activePage.id ? { ...p, pageHeight } : p))
      })
    }
  }, [pageHeight, activePage, pages, setPages])

  // Return to notebook dashboard
  const handleBackToDashboard = () => {
    setActiveNotebook(null)
    setActivePage(null)
    setPages([])
    setIsSidebarOpen(false)
  }

  // Focus title edit input
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  // Render Dashboard
  if (!activeNotebook) {
    return (
      <main className="fixed inset-0 overflow-y-auto bg-neutral-50 dark:bg-neutral-950 transition-colors duration-300">
        <NotebookList onSelectNotebook={handleSelectNotebook} />
      </main>
    )
  }

  // Render Notebook Editor
  // Render Notebook Editor
  return (
    <main className="fixed inset-0 overflow-hidden bg-neutral-200 dark:bg-neutral-900 select-none touch-none">

      {/* 4 Canvas Layers for drawing */}
      <div className="relative w-full h-full">
        <canvas
          ref={bgCanvasRef}
          className="absolute top-0 left-0 w-full h-full z-10"
        />
        <canvas
          ref={committedCanvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none z-20"
        />
        <canvas
          ref={activeCanvasRef}
          className="absolute top-0 left-0 w-full h-full cursor-none pointer-events-auto z-30"
        />
        <canvas
          ref={cursorCanvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none z-40"
        />
      </div>

      {/* FLOATING HEADER CONTROLS */}

      {/* Left panel: Back button & Notebook info & Autosave status */}
      <div id="header-left" className="fixed top-6 left-6 z-[100] flex items-center gap-3 pointer-events-auto cursor-auto select-auto">
        {/* Back Button */}
        <button
          onClick={(e) => { e.stopPropagation(); handleBackToDashboard(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`p-3 border rounded-2xl shadow-2xl backdrop-blur-md active:scale-95 transition-all ${darkMode
              ? 'bg-neutral-950/95 border-neutral-800 text-neutral-100 shadow-black/40 hover:bg-neutral-900'
              : 'bg-white/95 border-neutral-200 text-neutral-800 shadow-neutral-350/30 hover:bg-neutral-50'
            }`}
          title="Back to Notebooks"
        >
          <ArrowLeft size={18} />
        </button>

        {/* Notebook Meta card */}
        <div className={`flex items-center gap-4 border px-5 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md ${darkMode
            ? 'bg-neutral-950/95 border-neutral-800 text-neutral-100 shadow-black/40'
            : 'bg-white/95 border-neutral-200 text-neutral-800 shadow-neutral-350/30'
          }`}>
          {isEditingTitle ? (
            <div className="flex items-center gap-2 cursor-auto select-text" onPointerDown={(e) => e.stopPropagation()}>
              <input
                ref={titleInputRef}
                type="text"
                value={editTitleVal}
                onChange={(e) => setEditTitleVal(e.target.value)}
                onBlur={saveNotebookTitle}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveNotebookTitle()
                  if (e.key === 'Escape') setIsEditingTitle(false)
                }}
                className={`border text-sm font-bold px-2.5 py-1 rounded-xl outline-none focus:ring-1 focus:ring-blue-500 cursor-text select-text ${darkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-neutral-100 border-neutral-200 text-neutral-800'
                  }`}
              />
              <button
                onClick={saveNotebookTitle}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1 hover:bg-neutral-100 dark:hover:bg-white/5 rounded text-green-500"
              >
                <Check size={14} />
              </button>
            </div>
          ) : (
            <div
              onClick={() => {
                setIsEditingTitle(true)
                setEditTitleVal(activeNotebook.title)
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex items-center gap-2 cursor-pointer group"
              title="Click to rename"
            >
              <h2 className={`font-extrabold text-sm transition-colors ${darkMode ? 'text-neutral-200 group-hover:text-blue-400' : 'text-neutral-800 group-hover:text-blue-600'
                }`}>
                {activeNotebook.title}
              </h2>
              <Edit2 size={12} className="text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}

          <div className={`w-px h-4 ${darkMode ? 'bg-neutral-850' : 'bg-neutral-200'}`} />

          {/* Autosave badge */}
          <div className={`flex items-center gap-1.5 text-[11px] font-semibold font-mono ${darkMode ? 'text-neutral-400' : 'text-neutral-500'
            }`}>
            {isAutosaving ? (
              <>
                <Loader2 size={11} className="animate-spin text-blue-500" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span>Saved</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right panel: Page Navigator & Toggle Page Sidebar */}
      <div id="header-right" className="fixed top-6 right-6 z-[100] flex items-center gap-3 pointer-events-auto cursor-auto select-auto">

        {/* Page Navigator */}
        {pages.length > 0 && (
          <div className={`flex items-center gap-1 border p-1.5 rounded-2xl shadow-2xl backdrop-blur-md ${darkMode
              ? 'bg-neutral-950/95 border-neutral-800 text-neutral-100 shadow-black/40'
              : 'bg-white/95 border-neutral-200 text-neutral-800 shadow-neutral-350/30'
            }`}>
            <button
              onClick={(e) => { e.stopPropagation(); handlePrevPage(); }}
              className={`p-2 rounded-xl transition-all ${darkMode ? 'hover:bg-neutral-900 text-neutral-200' : 'hover:bg-neutral-100 text-neutral-700'
                }`}
              title="Previous Page"
            >
              <ChevronLeft size={16} />
            </button>

            <DynamicPageCounter pagesLength={pages.length} />

            <button
              onClick={(e) => { e.stopPropagation(); handleNextPage(); }}
              className={`p-2 rounded-xl transition-all ${darkMode ? 'hover:bg-neutral-900 text-neutral-200' : 'hover:bg-neutral-100 text-neutral-700'
                }`}
              title="Next Page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Toggle Page Sidebar */}
        <button
          onClick={() => setIsSidebarOpen(true)}
          className={`p-3 border rounded-2xl shadow-2xl backdrop-blur-md active:scale-95 transition-all flex items-center gap-2 ${darkMode
              ? 'bg-neutral-950/95 border-neutral-800 text-neutral-100 shadow-black/40 hover:bg-neutral-900'
              : 'bg-white/95 border-neutral-200 text-neutral-800 shadow-neutral-350/30 hover:bg-neutral-50'
            }`}
          title="Open Pages Menu"
        >
          <Layers size={18} />
          <span className="text-xs font-extrabold hidden sm:inline">Pages</span>
        </button>
      </div>

      {/* Floating Center Drawing Toolbar */}
      <Toolbar onUndo={undo} onRedo={redo} onResetZoom={fitPage} />

      {/* Pages Side Drawer */}
      <PageSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSelectPage={handleSelectPage}
      />

    </main>
  )
}
