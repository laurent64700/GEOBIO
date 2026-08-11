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

// A single cadastral parcel's outline, in the same LOCAL (mission-relative)
// coordinate system as everything else in this domain (felt points/segments,
// building footprint) — converted from cadastreService.ts's CadastralParcel
// (WFS lat/lng) at selection time via latLngToLocal, since that's the only
// point the mission's origin is guaranteed to already be set. `rings` mirrors
// CadastralParcel.ringsLatLng's shape (outer ring first, holes after, if
// any) for a SINGLE polygon part — a MultiPolygon parcel becomes multiple
// StoredParcel entries sharing the same id, exactly like CadastralParcel
// already does.
export interface StoredParcel {
  id: string
  section: string
  rings: Point[][]
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
  /** Full parcel geometry for the confirmed selection (parcelRefs above only
   * holds their ids) — null until parcels are confirmed via
   * ParcelSelectionStep, so the map can keep showing their outlines as a
   * permanent orientation reference afterward (field testing 08/2026:
   * Laurent needs them to stay visible to keep his bearings on the map). */
  selectedParcelsGeometry: StoredParcel[] | null
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
  currentBearingDeg: number | null
  depthM: number | null
  flowRate: string | null
  createdAt: string
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

export interface FeltSegment {
  id: string
  planId: string
  /** Free text, not a foreign key to GridTemplate — Laurent may search for a
   * network before its GridTemplate row exists, or use a name not yet templated. */
  networkName: string
  pointA: Point
  pointB: Point
  /** Polarity sensed at each end (reuses GridLinePolarity's '+'/'-'), chosen
   * manually when placed via the network felt-point tool. Null for segments
   * created via ArUco rod-marker detection (RodDetectionPanel) — polarity
   * can't be inferred from marker position alone, so it's left unset rather
   * than defaulted to a value nobody actually sensed. */
  polarityA: GridLinePolarity | null
  polarityB: GridLinePolarity | null
  createdAt: string
}

export type PhenomenonKind =
  | 'cheminee-1'
  | 'cheminee-2'
  | 'cheminee-3'
  | 'cheminee-4'
  | 'spire-vortex'
  | 'point-cosmique'
  | 'carre-magique'
  | 'tube-magique'

export interface Phenomenon {
  id: string
  planId: string
  kind: PhenomenonKind
  x: number
  y: number
  createdAt: string
}

export type ContextObjectKind =
  | 'canape'
  | 'table'
  | 'table-ronde'
  | 'lit'
  | 'arbre-chene'
  | 'arbre-pin'
  | 'haie'
  | 'puits'
  | 'mur-briques'
  | 'mur-pierre'
  | 'route'
  | 'cloture'

/**
 * A simple furniture/landscape marker for context missing from the aerial
 * photo (spec: e.g. a tree not visible on the IGN imagery during a Hartmann
 * survey) — no metadata beyond kind/position, unlike FeltPoint/Phenomenon.
 */
export interface ContextObject {
  id: string
  planId: string
  kind: ContextObjectKind
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
  /** Legacy per-photo calibration (pixel → mission-local metric). No longer
   * written by the app — rod-photo detection now derives its transform
   * automatically per detection run (see RodDetectionPanel.tsx /
   * rodPhotoCalibration.ts) rather than persisting one on the photo. Kept
   * for photos calibrated before that change; may be non-null on old rows. */
  calibration: AffineTransform | null
  createdAt: string
}
