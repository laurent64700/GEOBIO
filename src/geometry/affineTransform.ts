// src/geometry/affineTransform.ts
import type { AffineTransform, Point } from '../domain/types'

/**
 * Applies a calibration transform (as produced by `calibratePlan`, Plan 1
 * Chunk 2) to a point — pixel coordinates in, mission-local metric coordinates
 * out. Field convention verified against `calibratePlan`'s own construction:
 * x' = a*x + b*y + e, y' = c*x + d*y + f.
 */
export function applyAffineTransform(point: Point, transform: AffineTransform): Point {
  return {
    x: transform.a * point.x + transform.b * point.y + transform.e,
    y: transform.c * point.x + transform.d * point.y + transform.f,
  }
}
