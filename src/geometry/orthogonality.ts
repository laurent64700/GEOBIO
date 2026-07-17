import type { GridLineFamily, GridTemplate, Point } from '../domain/types'
import { bearingUnitVector } from './gridGeneration'

/** Bearing (degrees, 0 = north, clockwise) of the straight line from the first to the last point. */
export function lineBearingDeg(points: Point[]): number {
  if (points.length < 2) {
    throw new Error('Une ligne nécessite au moins 2 points pour calculer une direction.')
  }
  const start = points[0]
  const end = points[points.length - 1]
  const rad = Math.atan2(end.x - start.x, end.y - start.y)
  return (rad * 180) / Math.PI
}

/**
 * Angular difference between two bearings, compared modulo 180° — a line has
 * no directional sign, so 170° and 0° are 10° apart, not 170°. Result is in
 * (-90, 90].
 */
export function angularDeviationDeg(actualBearingDeg: number, theoreticalBearingDeg: number): number {
  let diff = (((actualBearingDeg - theoreticalBearingDeg) % 180) + 180) % 180
  if (diff > 90) diff -= 180
  return diff
}

/**
 * A straightened version of `points`, rotated to `theoreticalBearingDeg`
 * while preserving the line's centroid and total end-to-end length — this is
 * the "preview" shown by the orthogonality assist (spec §6.2), never applied
 * automatically.
 */
export function suggestOrthogonalStraighten(points: Point[], theoreticalBearingDeg: number): [Point, Point] {
  const centroid: Point = {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  }
  const start = points[0]
  const end = points[points.length - 1]
  const halfLength = Math.hypot(end.x - start.x, end.y - start.y) / 2
  const dir = bearingUnitVector(theoreticalBearingDeg)

  return [
    { x: centroid.x - dir.x * halfLength, y: centroid.y - dir.y * halfLength },
    { x: centroid.x + dir.x * halfLength, y: centroid.y + dir.y * halfLength },
  ]
}

/** The theoretical bearing of a grid line family: axis-a runs along the template's own angle, axis-b perpendicular to it. */
export function familyBearingDeg(
  template: Pick<GridTemplate, 'angleTrueNorthDeg'>,
  family: GridLineFamily
): number {
  return family === 'axis-a' ? template.angleTrueNorthDeg : template.angleTrueNorthDeg + 90
}

export function getOrthogonalitySuggestion(
  linePoints: Point[],
  family: GridLineFamily,
  template: Pick<GridTemplate, 'angleTrueNorthDeg'>
): { deviationDeg: number; suggestedPoints: [Point, Point] } {
  const theoreticalBearing = familyBearingDeg(template, family)
  const actualBearing = lineBearingDeg(linePoints)
  return {
    deviationDeg: angularDeviationDeg(actualBearing, theoreticalBearing),
    suggestedPoints: suggestOrthogonalStraighten(linePoints, theoreticalBearing),
  }
}
