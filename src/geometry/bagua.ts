// src/geometry/bagua.ts
import type { Point } from '../domain/types'

/**
 * Area-weighted (true geometric) centroid of a simple polygon, via the
 * shoelace-based centroid formula — NOT a vertex average, which diverges
 * from this on any non-convex polygon (see spec §6 for why this distinction
 * matters for an L-shaped building). `polygon` need not be explicitly closed
 * (last point == first point); this handles both cases.
 */
export function computeCentroid(polygon: Point[]): Point {
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < polygon.length; i++) {
    const p0 = polygon[i]
    const p1 = polygon[(i + 1) % polygon.length]
    const cross = p0.x * p1.y - p1.x * p0.y
    area += cross
    cx += (p0.x + p1.x) * cross
    cy += (p0.y + p1.y) * cross
  }
  area /= 2
  cx /= 6 * area
  cy /= 6 * area
  return { x: cx, y: cy }
}
