import type { Point } from '../domain/types'

export interface Segment {
  pointA: Point
  pointB: Point
}

// Angle (degrees, unsigned, 0-90) between the two segments' directions —
// used by intersectSegmentLines to reject near-parallel picks before the
// determinant gets numerically unstable.
function angleBetweenDeg(a: Segment, b: Segment): number {
  const da = { x: a.pointB.x - a.pointA.x, y: a.pointB.y - a.pointA.y }
  const db = { x: b.pointB.x - b.pointA.x, y: b.pointB.y - b.pointA.y }
  const dot = da.x * db.x + da.y * db.y
  const magA = Math.hypot(da.x, da.y)
  const magB = Math.hypot(db.x, db.y)
  const cos = Math.min(1, Math.max(-1, dot / (magA * magB)))
  const deg = (Math.acos(cos) * 180) / Math.PI
  return deg > 90 ? 180 - deg : deg
}

const MIN_ANGLE_DEG = 10

/**
 * Intersects the two INFINITE lines each segment defines (not the finite
 * segments themselves) — a felt segment marks a network axis's local
 * direction at the point Laurent sensed it, not a bounded obstacle, so the
 * real crossing point is wherever those two directions cross, which may
 * fall outside either segment's own 1m span. Returns null when the two
 * segments are too close to parallel (< 10°) for the crossing to be
 * numerically trustworthy — two rods felt on what should be perpendicular
 * (or near-perpendicular) axis families are expected to cross at a much
 * wider angle than that in practice.
 */
export function intersectSegmentLines(a: Segment, b: Segment): Point | null {
  if (angleBetweenDeg(a, b) < MIN_ANGLE_DEG) return null

  const [x1, y1] = [a.pointA.x, a.pointA.y]
  const [x2, y2] = [a.pointB.x, a.pointB.y]
  const [x3, y3] = [b.pointA.x, b.pointA.y]
  const [x4, y4] = [b.pointB.x, b.pointB.y]

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (denom === 0) return null

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
  return {
    x: x1 + t * (x2 - x1),
    y: y1 + t * (y2 - y1),
  }
}
