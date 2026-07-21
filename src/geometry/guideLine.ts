import { bearingUnitVector } from './gridGeneration'
import type { Point } from '../domain/types'

/**
 * A long segment through `anchor` at `bearingDeg`, `halfLengthM` in each
 * direction — enough to look like a line crossing the visible map area for a
 * typical residential-scale mission. Purely a visual walking aid (§Chunk 9
 * intro); never persisted.
 */
export function computeGuideLineEndpoints(
  anchor: Point,
  bearingDeg: number,
  halfLengthM = 60
): [Point, Point] {
  const dir = bearingUnitVector(bearingDeg)
  return [
    { x: anchor.x - dir.x * halfLengthM, y: anchor.y - dir.y * halfLengthM },
    { x: anchor.x + dir.x * halfLengthM, y: anchor.y + dir.y * halfLengthM },
  ]
}
