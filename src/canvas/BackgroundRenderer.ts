import type { Background } from '@/types/stroke'
import type { TransformSystem } from './TransformSystem'

// Desk colors
const DESK_LIGHT = '#f0f0f0'
const DESK_DARK = '#121212'

// Page background
const PAGE_LIGHT = '#ffffff'
const PAGE_DARK = '#1e1e1e'

// Template colors
const LINE_LIGHT = '#e8e8e8'
const LINE_DARK = '#2d2d2d'
const DOT_LIGHT = '#d0d0d0'
const DOT_DARK = '#333333'

const GRID_SPACING = 32 // world units
const PAGE_WIDTH = 795
const A4_HEIGHT = 1122

export interface RenderBackgroundOptions {
  ctx: CanvasRenderingContext2D
  transform: TransformSystem
  background: Background
  darkMode: boolean
  pageWidth: number
  pageHeight: number
  devicePixelRatio?: number
}

export function renderBackground(opts: RenderBackgroundOptions): void {
  const { ctx, transform, background, darkMode, pageHeight } = opts
  const dpr = opts.devicePixelRatio ?? 1
  const canvasW = ctx.canvas.width / dpr
  const canvasH = ctx.canvas.height / dpr

  // 1. Desk area
  ctx.fillStyle = darkMode ? DESK_DARK : DESK_LIGHT
  ctx.fillRect(0, 0, canvasW, canvasH)

  // 2. Page shadow and background
  const { x: pageLeft, y: pageTop } = transform.worldToScreen(0, 0)
  const { x: pageRight, y: pageBottom } = transform.worldToScreen(PAGE_WIDTH, pageHeight)
  const pageScreenW = pageRight - pageLeft
  const pageScreenH = pageBottom - pageTop

  ctx.save()
  ctx.shadowColor = darkMode ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.15)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 2
  ctx.fillStyle = darkMode ? PAGE_DARK : PAGE_LIGHT
  ctx.fillRect(pageLeft, pageTop, pageScreenW, pageScreenH)
  ctx.restore()

  // 3. Template lines (clipped to page)
  ctx.save()
  ctx.beginPath()
  ctx.rect(pageLeft, pageTop, pageScreenW, pageScreenH)
  ctx.clip()

  ctx.strokeStyle = darkMode ? LINE_DARK : LINE_LIGHT
  ctx.lineWidth = 1

  switch (background) {
    case 'ruled':
      renderRuled(ctx, transform, darkMode, pageHeight)
      break
    case 'dotted':
      renderDotted(ctx, transform, darkMode, pageHeight)
      break
    case 'grid':
      renderGrid(ctx, transform, darkMode, pageHeight)
      break
    case 'cornell':
      renderCornell(ctx, transform, darkMode, pageHeight)
      break
    default:
      break
  }

  // 4. Page Separators
  drawPageSeparators(ctx, transform, pageHeight)

  ctx.restore()
}

function drawPageSeparators(ctx: CanvasRenderingContext2D, transform: TransformSystem, pageHeight: number) {
  const separatorPositions: number[] = []
  for (let y = A4_HEIGHT; y < pageHeight; y += A4_HEIGHT) {
    separatorPositions.push(y)
  }

  for (const worldY of separatorPositions) {
    const { y: screenY } = transform.worldToScreen(0, worldY)
    const { x: pageLeft } = transform.worldToScreen(0, 0)
    const { x: pageRight } = transform.worldToScreen(PAGE_WIDTH, 0)

    ctx.save()
    ctx.strokeStyle = '#2563eb' // Tailwind blue-600
    ctx.lineWidth = 3
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(pageLeft, screenY)
    ctx.lineTo(pageRight, screenY)
    ctx.stroke()

    // Page label
    ctx.fillStyle = '#2563eb'
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText(`Page ${separatorPositions.indexOf(worldY) + 2}`, pageLeft + 8, screenY - 4)
    ctx.restore()
  }
}

function renderRuled(ctx: CanvasRenderingContext2D, transform: TransformSystem, darkMode: boolean, pageHeight: number) {
  const { x: startX } = transform.worldToScreen(0, 0)
  const { x: endX } = transform.worldToScreen(PAGE_WIDTH, 0)
  
  for (let y = GRID_SPACING; y < pageHeight; y += GRID_SPACING) {
    const { y: screenY } = transform.worldToScreen(0, y)
    ctx.beginPath()
    ctx.moveTo(startX, screenY)
    ctx.lineTo(endX, screenY)
    ctx.stroke()
  }
}

function renderGrid(ctx: CanvasRenderingContext2D, transform: TransformSystem, darkMode: boolean, pageHeight: number) {
  const { x: startX, y: startY } = transform.worldToScreen(0, 0)
  const { x: endX, y: endY } = transform.worldToScreen(PAGE_WIDTH, pageHeight)

  ctx.beginPath()
  for (let y = 0; y <= pageHeight; y += GRID_SPACING) {
    const { y: screenY } = transform.worldToScreen(0, y)
    ctx.moveTo(startX, screenY)
    ctx.lineTo(endX, screenY)
  }
  for (let x = 0; x <= PAGE_WIDTH; x += GRID_SPACING) {
    const { x: screenX } = transform.worldToScreen(x, 0)
    ctx.moveTo(screenX, startY)
    ctx.lineTo(screenX, endY)
  }
  ctx.stroke()
}

function renderDotted(ctx: CanvasRenderingContext2D, transform: TransformSystem, darkMode: boolean, pageHeight: number) {
  ctx.fillStyle = darkMode ? DOT_DARK : DOT_LIGHT
  const dotSize = Math.max(1, transform.zoom * 0.8)

  for (let x = GRID_SPACING; x < PAGE_WIDTH; x += GRID_SPACING) {
    for (let y = GRID_SPACING; y < pageHeight; y += GRID_SPACING) {
      const { x: sx, y: sy } = transform.worldToScreen(x, y)
      ctx.beginPath()
      ctx.arc(sx, sy, dotSize, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function renderCornell(ctx: CanvasRenderingContext2D, transform: TransformSystem, darkMode: boolean, pageHeight: number) {
  const { x: leftX, y: topY } = transform.worldToScreen(0, 0)
  const { x: rightX, y: bottomY } = transform.worldToScreen(PAGE_WIDTH, pageHeight)

  const { x: marginX } = transform.worldToScreen(PAGE_WIDTH * 0.25, 0)
  ctx.beginPath()
  ctx.moveTo(marginX, topY)
  ctx.lineTo(marginX, bottomY)
  ctx.stroke()

  const { y: summaryY } = transform.worldToScreen(0, pageHeight * 0.8)
  ctx.beginPath()
  ctx.moveTo(leftX, summaryY)
  ctx.lineTo(rightX, summaryY)
  ctx.stroke()
}
