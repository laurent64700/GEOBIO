// src/geometry/bagua.ts
import type { Point } from '../domain/types'
import { bearingUnitVector } from './gridGeneration'

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

/**
 * Distance from `center` to the farthest vertex of `polygon` — used as the
 * Bagua grid's radius so the 8 sectors fully cover the building, including
 * its farthest wing on a non-convex (L-shaped) footprint (spec §6). This
 * over-extends slightly on the building's short axis; accepted tradeoff,
 * see spec.
 */
export function computeMaxRadius(polygon: Point[], center: Point): number {
  return Math.max(
    ...polygon.map((p) => Math.hypot(p.x - center.x, p.y - center.y))
  )
}

export type CompassDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'

export interface BaguaSector {
  compassDirection: CompassDirection
  /** Wedge polygon: [center, edge point at bearing-22.5°, edge point at bearing+22.5°]. */
  points: Point[]
}

export const COMPASS_ORDER: CompassDirection[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/**
 * 8 equal 45° wedges around `center`, always oriented to true north (bearing
 * 0°) — deliberately NOT parameterized by an angle, unlike
 * generateTheoreticalLines' angleTrueNorthDeg, which is a per-network
 * field-sensed value. The Bagua's orientation is fixed by definition of the
 * classical/compass method (spec §3): passing a variable angle here would be
 * a methodology error, not a missing feature.
 */
export function computeBaguaSectors(center: Point, radiusM: number): BaguaSector[] {
  return COMPASS_ORDER.map((compassDirection, i) => {
    const centerBearing = i * 45
    const edge1 = bearingUnitVector(centerBearing - 22.5)
    const edge2 = bearingUnitVector(centerBearing + 22.5)
    return {
      compassDirection,
      points: [
        center,
        { x: center.x + edge1.x * radiusM, y: center.y + edge1.y * radiusM },
        { x: center.x + edge2.x * radiusM, y: center.y + edge2.y * radiusM },
      ],
    }
  })
}
