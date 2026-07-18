import type { GridLine, Point } from '../domain/types'

export function applyVertexDrag(line: GridLine, pointIndex: number, newPoint: Point): GridLine {
  const adjustedPoints = [...line.adjustedPoints]
  adjustedPoints[pointIndex] = newPoint
  return { ...line, adjustedPoints }
}

export function resetToTheoretical(line: GridLine): GridLine {
  return { ...line, adjustedPoints: [...line.theoreticalPoints] }
}
