// src/geometry/polylineSimplify.ts
import type { Point } from '../domain/types'

/**
 * Reduces a dense freehand-captured polyline (one point per pointer-move
 * event) to a sparser one: a point is kept only if it's at least
 * `minDistanceM` away from the last KEPT point (not the last raw point) —
 * this is what actually bounds the total point count for a long, slow
 * gesture, unlike comparing only to the immediately preceding raw point.
 * The first and last points are always kept so the traced line's real
 * start/end aren't altered.
 */
export function simplifyByMinDistance(points: Point[], minDistanceM: number): Point[] {
  if (points.length <= 2) return points

  const result: Point[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const last = result[result.length - 1]
    const dist = Math.hypot(points[i].x - last.x, points[i].y - last.y)
    if (dist >= minDistanceM) result.push(points[i])
  }
  result.push(points[points.length - 1])
  return result
}
