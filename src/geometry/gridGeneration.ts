import type { GridTemplate, GridLineFamily, Point } from '../domain/types'

export interface BoundingBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** Unit vector for a compass bearing in degrees (0 = north, 90 = east, clockwise). */
export function bearingUnitVector(bearingDeg: number): Point {
  const rad = (bearingDeg * Math.PI) / 180
  return { x: Math.sin(rad), y: Math.cos(rad) }
}

/**
 * Clips the infinite line { origin + t * direction | t in R } to an axis-aligned
 * bounding box. Returns the two intersection points (in increasing-t order), or
 * null if the line never crosses the box.
 */
export function clipLineToBounds(
  origin: Point,
  direction: Point,
  bounds: BoundingBox
): [Point, Point] | null {
  let tMin = -Infinity
  let tMax = Infinity

  if (direction.x === 0) {
    if (origin.x < bounds.minX || origin.x > bounds.maxX) return null
  } else {
    const t1 = (bounds.minX - origin.x) / direction.x
    const t2 = (bounds.maxX - origin.x) / direction.x
    tMin = Math.max(tMin, Math.min(t1, t2))
    tMax = Math.min(tMax, Math.max(t1, t2))
  }

  if (direction.y === 0) {
    if (origin.y < bounds.minY || origin.y > bounds.maxY) return null
  } else {
    const t1 = (bounds.minY - origin.y) / direction.y
    const t2 = (bounds.maxY - origin.y) / direction.y
    tMin = Math.max(tMin, Math.min(t1, t2))
    tMax = Math.min(tMax, Math.max(t1, t2))
  }

  if (tMin > tMax) return null

  return [
    { x: origin.x + tMin * direction.x, y: origin.y + tMin * direction.y },
    { x: origin.x + tMax * direction.x, y: origin.y + tMax * direction.y },
  ]
}

export interface GeneratedLine {
  family: GridLineFamily
  /**
   * Alternates by grid index (even = '+', odd = '-') — this is the network's
   * deterministic theoretical polarity pattern (confirmed for this family of
   * rectangular networks: a fixed checkerboard alternation), not something
   * measured in the field. Laurent's felt-line adjustment (§6.2) can still
   * override it per line once GridLine editing (Chunk 6) exists.
   */
  polarity: '+' | '-'
  points: [Point, Point]
}

function maxOffsetIndexNeeded(
  origin: Point,
  spacing: number,
  bounds: BoundingBox
): number {
  const corners: Point[] = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.minX, y: bounds.maxY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
  ]
  // Deliberately a loose over-approximation (max Euclidean distance to any
  // corner, not projected onto the step direction) — simple and always safe:
  // candidates that don't actually reach the box are dropped later because
  // clipLineToBounds returns null for them.
  const maxDist = Math.max(
    ...corners.map((c) => Math.hypot(c.x - origin.x, c.y - origin.y))
  )
  return Math.ceil(maxDist / spacing) + 1
}

/**
 * `origin` is the final, already-composed grid origin (i.e. `grid_instance.origin_{x,y}`
 * with `template.originOffsetX/Y` already applied) — composing that offset is the
 * caller's responsibility (Chunk 5, when a `GridInstance` is generated), not this
 * function's, since this module has no knowledge of `GridInstance`.
 */
export function generateTheoreticalLines(
  template: Pick<GridTemplate, 'spacingXM' | 'spacingYM' | 'angleTrueNorthDeg'>,
  origin: Point,
  bounds: BoundingBox
): GeneratedLine[] {
  const primaryDir = bearingUnitVector(template.angleTrueNorthDeg)
  const perpDir = bearingUnitVector(template.angleTrueNorthDeg + 90)
  const lines: GeneratedLine[] = []

  const offsetA = maxOffsetIndexNeeded(origin, template.spacingYM, bounds)
  for (let k = -offsetA; k <= offsetA; k++) {
    const linePoint: Point = {
      x: origin.x + k * template.spacingYM * perpDir.x,
      y: origin.y + k * template.spacingYM * perpDir.y,
    }
    const clipped = clipLineToBounds(linePoint, primaryDir, bounds)
    if (clipped) lines.push({ family: 'axis-a', polarity: k % 2 === 0 ? '+' : '-', points: clipped })
  }

  const offsetB = maxOffsetIndexNeeded(origin, template.spacingXM, bounds)
  for (let k = -offsetB; k <= offsetB; k++) {
    const linePoint: Point = {
      x: origin.x + k * template.spacingXM * primaryDir.x,
      y: origin.y + k * template.spacingXM * primaryDir.y,
    }
    const clipped = clipLineToBounds(linePoint, perpDir, bounds)
    if (clipped) lines.push({ family: 'axis-b', polarity: k % 2 === 0 ? '+' : '-', points: clipped })
  }

  return lines
}
