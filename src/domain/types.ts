export interface Point {
  x: number
  y: number
}

/** Affine transform mapping image pixel coordinates to mission-local metric (x, y). */
export interface AffineTransform {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export interface Mission {
  id: string
  address: string
  missionDate: string // ISO date
  declinationDeg: number | null
  originLat: number | null
  originLng: number | null
}

export type PlanKind = 'exterieur' | 'interieur'

export interface Plan {
  id: string
  missionId: string
  kind: PlanKind
  imageUrl: string | null
  calibration: AffineTransform | null
}

export interface GridTemplate {
  id: string
  name: string
  /**
   * Spacing (meters) between consecutive 'axis-b' lines — the line family
   * running *perpendicular* to `angleTrueNorthDeg` — stepped along the
   * bearing direction. See `generateTheoreticalLines` in
   * src/geometry/gridGeneration.ts, which is the sole consumer.
   */
  spacingXM: number
  /**
   * Spacing (meters) between consecutive 'axis-a' lines — the line family
   * running *parallel* to `angleTrueNorthDeg` — stepped perpendicular to the
   * bearing direction. See `generateTheoreticalLines` in
   * src/geometry/gridGeneration.ts, which is the sole consumer.
   *
   * Neither field is a raw cartesian X/Y spacing: both line families are
   * generated in a frame rotated by `angleTrueNorthDeg`. Which figure from
   * the physical reference manual should feed spacingXM vs spacingYM is
   * unverified for asymmetric networks (Hartmann, Palm, Peyré) — see
   * supabase/migrations/0005_seed_confirmed_networks.sql for details.
   */
  spacingYM: number
  angleTrueNorthDeg: number
  originOffsetX: number
  originOffsetY: number
  /** Single color for the whole network — polarity is shown via line style (solid/dashed), not a second color. */
  color: string
}

export interface GridInstance {
  id: string
  planId: string
  templateSnapshot: GridTemplate
  originX: number
  originY: number
}

export type GridLineFamily = 'axis-a' | 'axis-b'

export type GridLinePolarity = '+' | '-'

export interface GridLine {
  id: string
  gridInstanceId: string
  family: GridLineFamily
  polarity: GridLinePolarity
  theoreticalPoints: Point[]
  adjustedPoints: Point[]
}

export type FreeformNetworkKind = 'eau' | 'faille'

export interface FreeformNetwork {
  id: string
  planId: string
  kind: FreeformNetworkKind
  points: Point[]
}
