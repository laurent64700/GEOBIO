import type { GridLine, Point } from '../domain/types'

const EPSILON = 1e-9

/**
 * Standard 2D line-segment intersection via parametric form. Returns the
 * intersection point if segments a1-a2 and b1-b2 cross within their own
 * bounds (t, u both in [0,1] INCLUSIVE — a crossing exactly on an endpoint
 * counts), or null if the segments are parallel/near-parallel (determinant
 * near zero, compared against an epsilon rather than exact equality — real
 * floating-point line angles are never exactly parallel) or if the
 * intersection of the underlying infinite lines falls outside either
 * segment. Colinear/overlapping segments are deliberately treated as
 * "parallel → null" (no single well-defined crossing point) rather than a
 * special case — not expected to occur between the fixed-angle networks
 * this is built for (Hartmann 0°, Curry 45°).
 */
export function computeSegmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d1x = a2.x - a1.x
  const d1y = a2.y - a1.y
  const d2x = b2.x - b1.x
  const d2y = b2.y - b1.y

  const denominator = d1x * d2y - d1y * d2x
  if (Math.abs(denominator) < EPSILON) return null // parallel or near-parallel

  const dx = b1.x - a1.x
  const dy = b1.y - a1.y
  const t = (dx * d2y - dy * d2x) / denominator
  const u = (dx * d1y - dy * d1x) / denominator

  if (t < 0 || t > 1 || u < 0 || u > 1) return null

  const x = a1.x + t * d1x
  const y = a1.y + t * d1y
  return { x: x === 0 ? 0 : x, y: y === 0 ? 0 : y } // normalize -0 to 0
}

export interface PathogenicCrossing {
  point: Point
  hartmannLineId: string
  curryLineId: string
}

/**
 * All Hartmann×Curry crossing points across two sets of grid lines, using
 * each line's adjustedPoints (field-calibrated positions — see spec §1 for
 * why this is the "truth" per Laurent's methodology, not theoreticalPoints).
 * Iterates every consecutive segment pair of every Hartmann line against
 * every consecutive segment pair of every Curry line — NOT whole lines as
 * single segments: adjustedPoints is an arbitrary-length polyline (a line
 * edited in the field via leaflet-geoman can have many vertices), so a
 * single bent Hartmann line can cross a single Curry line more than once.
 * That is correct behavior, not a bug to deduplicate.
 */
export function computeHartmannCurryCrossings(
  hartmannLines: GridLine[],
  curryLines: GridLine[]
): PathogenicCrossing[] {
  const crossings: PathogenicCrossing[] = []

  for (const hartmannLine of hartmannLines) {
    for (const curryLine of curryLines) {
      for (let i = 0; i < hartmannLine.adjustedPoints.length - 1; i++) {
        const h1 = hartmannLine.adjustedPoints[i]
        const h2 = hartmannLine.adjustedPoints[i + 1]
        for (let j = 0; j < curryLine.adjustedPoints.length - 1; j++) {
          const c1 = curryLine.adjustedPoints[j]
          const c2 = curryLine.adjustedPoints[j + 1]
          const point = computeSegmentIntersection(h1, h2, c1, c2)
          if (point) {
            crossings.push({ point, hartmannLineId: hartmannLine.id, curryLineId: curryLine.id })
          }
        }
      }
    }
  }

  return crossings
}
