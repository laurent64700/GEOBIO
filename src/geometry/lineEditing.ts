import type { GridLine, Point } from '../domain/types'

export function applyVertexDrag(line: GridLine, pointIndex: number, newPoint: Point): GridLine {
  const adjustedPoints = [...line.adjustedPoints]
  adjustedPoints[pointIndex] = newPoint
  return { ...line, adjustedPoints }
}

/**
 * Replaces the whole `adjustedPoints` array in one immutable update, from a
 * full set of dragged vertices (e.g. a drag-end event's `getLatLngs()`
 * result, already converted to local points). Use this instead of calling
 * `applyVertexDrag` once per vertex in a loop — folding every vertex into a
 * single update avoids firing `onChanged` more than once per drag gesture
 * (each of which would otherwise close over the same stale `line` and race
 * against each other).
 */
export function applyAllVertices(line: GridLine, points: Point[]): GridLine {
  return { ...line, adjustedPoints: [...points] }
}

export function resetToTheoretical(line: GridLine): GridLine {
  return { ...line, adjustedPoints: [...line.theoreticalPoints] }
}

/**
 * Rigidly shifts both theoreticalPoints and adjustedPoints by the same
 * delta — used when recalibrating a whole GridInstance's origin onto a real
 * felt crossing (grid-recalibration feature): every line moves together,
 * keeping its shape/spacing/angle (the "aligner sur l'axe théorique"
 * requirement) and preserving any prior felt-adjustment already made to a
 * line (shifted along with it, not discarded).
 */
export function translateGridLine(line: GridLine, delta: Point): GridLine {
  const shift = (p: Point): Point => ({ x: p.x + delta.x, y: p.y + delta.y })
  return {
    ...line,
    theoreticalPoints: line.theoreticalPoints.map(shift),
    adjustedPoints: line.adjustedPoints.map(shift),
  }
}
