/** Point always stored in world coordinates */
export type Point = {
  x: number
  y: number
  pressure: number
}

export type StrokeTool = 'pen' | 'eraser'

export type Stroke = {
  id: string
  tool: StrokeTool
  color: string
  width: number
  points: Point[]
  createdAt: number
}
