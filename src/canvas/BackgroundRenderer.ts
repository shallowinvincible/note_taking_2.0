import type { Background } from '@/types/stroke'
import type { TransformSystem } from './TransformSystem'

const LINE_COLOR_LIGHT = '#e8e8e8'
const LINE_COLOR_DARK = '#2a2a2a'
const DOT_COLOR_LIGHT = '#d0d0d0'
const DOT_COLOR_DARK = '#333333'
const PAGE_BG_LIGHT = '#ffffff'
const PAGE_BG_DARK = '#1e1e1e'
const DESK_BG_LIGHT = '#f0f0f0'
const DESK_BG_DARK = '#1a1a1a'

const GRID_SPACING = 32 // world units

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
  const { ctx, transform, background, darkMode, pageWidth, pageHeight } = opts
  const dpr = opts.devicePixelRatio ?? 1
  const canvasW = ctx.canvas.width / dpr
  const canvasH = ctx.canvas.height / dpr

  ctx.clearRect(0, 0, canvasW, canvasH)

  // 1. Desk area (the "gray" background outside the page)
  ctx.fillStyle = darkMode ? DESK_BG_DARK : DESK_BG_LIGHT
  ctx.fillRect(0, 0, canvasW, canvasH)

  // 2. Page shadow and background
  const { x: pageLeft, y: pageTop } = transform.worldToScreen(0, 0)
  const { x: pageRight, y: pageBottom } = transform.worldToScreen(pageWidth, pageHeight)
  const pageScreenW = pageRight - pageLeft
  const pageScreenH = pageBottom - pageTop

  // Simple shadow
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.15)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 4
  ctx.fillStyle = darkMode ? PAGE_BG_DARK : PAGE_BG_LIGHT
  ctx.fillRect(pageLeft, pageTop, pageScreenW, pageScreenH)
  ctx.restore()

  // 3. Template lines (clipped to page)
  ctx.save()
  ctx.beginPath()
  ctx.rect(pageLeft, pageTop, pageScreenW, pageScreenH)
  ctx.clip()

  ctx.strokeStyle = darkMode ? LINE_COLOR_DARK : LINE_COLOR_LIGHT
  ctx.lineWidth = 1

  switch (background) {
    case 'ruled':
      renderRuled(ctx, transform, darkMode, pageWidth, pageHeight)
      break
    case 'dotted':
      renderDotted(ctx, transform, darkMode, pageWidth, pageHeight)
      break
    case 'grid':
      renderGrid(ctx, transform, darkMode, pageWidth, pageHeight)
      break
    case 'cornell':
      renderCornell(ctx, transform, darkMode, pageWidth, pageHeight)
      break
    case 'blank':
    default:
      break
  }

  ctx.restore()
}

function renderRuled(ctx: CanvasRenderingContext2D, transform: TransformSystem, darkMode: boolean, pageWidth: number, pageHeight: number) {
  const { x: startX } = transform.worldToScreen(0, 0)
  const { x: endX } = transform.worldToScreen(pageWidth, 0)
  
  for (let y = GRID_SPACING; y < pageHeight; y += GRID_SPACING) {
    const { y: screenY } = transform.worldToScreen(0, y)
    ctx.beginPath()
    ctx.moveTo(startX, screenY)
    ctx.lineTo(endX, screenY)
    ctx.stroke()
  }
}

function renderGrid(ctx: CanvasRenderingContext2D, transform: TransformSystem, darkMode: boolean, pageWidth: number, pageHeight: number) {
  const { x: startX, y: startY } = transform.worldToScreen(0, 0)
  const { x: endX, y: endY } = transform.worldToScreen(pageWidth, pageHeight)

  ctx.beginPath()
  // Horizontal lines
  for (let y = 0; y <= pageHeight; y += GRID_SPACING) {
    const { y: screenY } = transform.worldToScreen(0, y)
    ctx.moveTo(startX, screenY)
    ctx.lineTo(endX, screenY)
  }
  // Vertical lines
  for (let x = 0; x <= pageWidth; x += GRID_SPACING) {
    const { x: screenX } = transform.worldToScreen(x, 0)
    ctx.moveTo(screenX, startY)
    ctx.lineTo(screenX, endY)
  }
  ctx.stroke()
}

function renderDotted(ctx: CanvasRenderingContext2D, transform: TransformSystem, darkMode: boolean, pageWidth: number, pageHeight: number) {
  ctx.fillStyle = darkMode ? DOT_COLOR_DARK : DOT_COLOR_LIGHT
  const dotSize = Math.max(1, transform.zoom)

  for (let x = GRID_SPACING; x < pageWidth; x += GRID_SPACING) {
    for (let y = GRID_SPACING; y < pageHeight; y += GRID_SPACING) {
      const { x: sx, y: sy } = transform.worldToScreen(x, y)
      ctx.beginPath()
      ctx.arc(sx, sy, dotSize, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function renderCornell(ctx: CanvasRenderingContext2D, transform: TransformSystem, darkMode: boolean, pageWidth: number, pageHeight: number) {
  const { x: leftX, y: topY } = transform.worldToScreen(0, 0)
  const { x: rightX, y: bottomY } = transform.worldToScreen(pageWidth, pageHeight)

  // Vertical margin at 25%
  const { x: marginX } = transform.worldToScreen(pageWidth * 0.25, 0)
  ctx.beginPath()
  ctx.moveTo(marginX, topY)
  ctx.lineTo(marginX, bottomY)
  ctx.stroke()

  // Horizontal summary at 80%
  const { y: summaryY } = transform.worldToScreen(0, pageHeight * 0.8)
  ctx.beginPath()
  ctx.moveTo(leftX, summaryY)
  ctx.lineTo(rightX, summaryY)
  ctx.stroke()
}
