import type { AffineTransform, Point } from '../domain/types'

export interface ControlPoint {
  /** Pixel coordinates in the source plan image. */
  image: Point
  /** Mission-local metric coordinates this pixel corresponds to. */
  real: Point
}

export class CalibrationError extends Error {}

// Spec §3.1 caps control points at "2 à 4" — enforced by the UI (Chunk 4, which
// only ever offers up to 4 control-point slots), not here: this function accepts
// any count >= MIN_CONTROL_POINTS by design, so it isn't artificially restricted
// if that UI cap ever changes.
const MIN_CONTROL_POINTS = 2
const MIN_REAL_DISTANCE_M = 2

function solveLinearSystem(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length
  const M = matrix.map((row, i) => [...row, rhs[i]])

  for (let col = 0; col < n; col++) {
    let pivotRow = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) pivotRow = r
    }
    ;[M[col], M[pivotRow]] = [M[pivotRow], M[col]]

    const pivot = M[col][col]
    if (Math.abs(pivot) < 1e-9) {
      throw new CalibrationError(
        'Points de contrôle dégénérés (colinéaires en image ou en réel) — calage impossible.'
      )
    }
    for (let c = col; c <= n; c++) M[col][c] /= pivot

    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = M[r][col]
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c]
    }
  }

  return M.map((row) => row[n])
}

/**
 * Fits a similarity transform (uniform scale + rotation + translation — no
 * shear, matching spec §3.1 "échelle + rotation + position") from 2-4 control
 * points, by least squares. The transform is linear in its 4 unknowns
 * (a, b, tx, ty) regardless of point count, so the same solver handles the
 * exactly-determined case (2 points) and the over-determined case (3-4
 * points) uniformly — no separate "exact" vs "least-squares" code paths.
 */
export function calibratePlan(points: ControlPoint[]): AffineTransform {
  if (points.length < MIN_CONTROL_POINTS) {
    throw new CalibrationError(
      `Au moins ${MIN_CONTROL_POINTS} points de contrôle sont nécessaires pour caler un plan.`
    )
  }

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dist = Math.hypot(
        points[i].real.x - points[j].real.x,
        points[i].real.y - points[j].real.y
      )
      if (dist < MIN_REAL_DISTANCE_M) {
        throw new CalibrationError(
          `Les points de contrôle ${i + 1} et ${j + 1} sont trop proches ` +
            `(${dist.toFixed(2)} m) — au moins ${MIN_REAL_DISTANCE_M} m d'écart requis.`
        )
      }
    }
  }

  // x' = a*x - b*y + tx ; y' = b*x + a*y + ty  — linear in (a, b, tx, ty)
  const rows: number[][] = []
  const rhs: number[] = []
  for (const { image: p, real: m } of points) {
    rows.push([p.x, -p.y, 1, 0])
    rhs.push(m.x)
    rows.push([p.y, p.x, 0, 1])
    rhs.push(m.y)
  }

  const ATA = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]
  const ATb = [0, 0, 0, 0]
  for (let i = 0; i < rows.length; i++) {
    for (let r = 0; r < 4; r++) {
      ATb[r] += rows[i][r] * rhs[i]
      for (let c = 0; c < 4; c++) {
        ATA[r][c] += rows[i][r] * rows[i][c]
      }
    }
  }

  const [a, b, tx, ty] = solveLinearSystem(ATA, ATb)
  return { a, b: -b, c: b, d: a, e: tx, f: ty }
}
