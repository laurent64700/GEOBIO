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
  causeArchitectural: number | null
  causeElectromagnetique: number | null
  causeGeobiologique: number | null
  causeParanormale: number | null
  causeAutres: number | null
  bovisRate: number | null
  parcelRefs: string[]
  /** Outer ring only (holes/multi-ring buildings not modeled — see spec §6 for the
   * tradeoff). Null until a building is fetched and confirmed via "Changer de bâtiment". */
  buildingFootprint: Point[] | null
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
   * generated in a frame rotated by `angleTrueNorthDeg`. For asymmetric
   * networks (Hartmann, Palm, Peyré), spacingXM takes the manual's N-S
   * figure and spacingYM takes its E-W figure — confirmed against a manual
   * diagram on 2026-07-18, see supabase/migrations/0005_seed_confirmed_networks.sql
   * for details.
   */
  spacingYM: number
  angleTrueNorthDeg: number
  originOffsetX: number
  originOffsetY: number
  /** Single color for the whole network — polarity is shown via line style (solid/dashed), not a second color. */
  color: string
  /** Every Nth line in a family is a reinforced/doubled "harmonic" line — N is this value ("base vibratoire"). */
  vibratoryBase: number
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
  /** True for every vibratoryBase-th line in its family (a reinforced/doubled harmonic line). */
  reinforced: boolean
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

export interface FeltPoint {
  id: string
  planId: string
  /** Free text, not a foreign key to GridTemplate — Laurent may search for a
   * network before its GridTemplate row exists, or use a name not yet templated. */
  networkName: string
  x: number
  y: number
  createdAt: string
}

/**
 * Fixed manufacture-time mapping of an ArUco marker ID to the network and rod
 * it is glued to — see docs/superpowers/specs/2026-07-16-rod-marker-detection-design.md.
 */
export interface RodMarker {
  markerId: number
  networkName: string
  rodNumber: number
}

/**
 * A mission-level aerial photo, attached to the mission as a whole, not to a
 * specific grid/network. Storage/display since Plan 1 Chunk 10; also the input
 * to ArUco rod-marker detection (2026-07-16 sub-project) once calibrated.
 */
export interface MissionPhoto {
  id: string
  missionId: string
  imageUrl: string
  /** Per-photo calibration (pixel → mission-local metric), null until Laurent
   * calibrates this photo for rod detection — each aerial photo has its own
   * framing/angle, so calibration lives on the photo, not the mission. */
  calibration: AffineTransform | null
  createdAt: string
}
