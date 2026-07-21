// src/data/wfsGeometry.ts
import type { LatLng } from '../geometry/localCoordinates'

// GeoJSON geometry as returned by the IGN Géoplateforme WFS. `coordinates` is
// deliberately `unknown`: its nesting depth depends on `type`, and trusting a
// single hardcoded shape is exactly the bug this module exists to fix — both
// BDTOPO_V3:batiment and CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle can
// legitimately return MultiPolygon features (building/parcel with several
// disjoint parts), not just Polygon.
export interface WfsGeometry {
  type: string
  coordinates: unknown
}

type Position = [number, number]
type PolygonRings = Position[][] // GeoJSON Polygon coordinates: rings of [lng, lat]

function ringsToLatLng(rings: PolygonRings): LatLng[][] {
  return rings.map((ring) => ring.map(([lng, lat]) => ({ lat, lng })))
}

/**
 * Normalize a GeoJSON `Polygon` or `MultiPolygon` into a list of polygon
 * PARTS, each part being that polygon's ring array (outer ring first, holes
 * after — GeoJSON order preserved) with positions converted from GeoJSON's
 * [lng, lat] to `{ lat, lng }`.
 *
 * - `Polygon` (`coordinates: number[][][]`) → exactly one part.
 * - `MultiPolygon` (`coordinates: number[][][][]`) → one part per member
 *   polygon. Callers emit one entry (building candidate / parcel) per part —
 *   chosen over flattening all parts' rings into a single entry because the
 *   existing `ringsLatLng: LatLng[][]` shape only has room for ONE polygon's
 *   rings: a second part's outer ring appended there would be interpreted as
 *   a hole of the first part and rendered/parsed wrongly. Splitting parts
 *   into separate entries also fits the picker UX: each disjoint part
 *   (house, garage, dépendance…) becomes separately clickable, and Laurent
 *   clicks the main building anyway (spec §6 step 3).
 * - Any other geometry type (Point, LineString…) → `[]`, so callers skip the
 *   feature instead of silently producing NaN coordinates — which is what the
 *   previous Polygon-only destructuring did on MultiPolygon input (each
 *   "position" destructured to a pair of arrays, giving `{ lat: number[],
 *   lng: number[] }` and invisible NaN polygons in Leaflet, with no error).
 */
export function polygonPartsToLatLng(geometry: WfsGeometry): LatLng[][][] {
  if (geometry.type === 'Polygon') {
    return [ringsToLatLng(geometry.coordinates as PolygonRings)]
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as PolygonRings[]).map(ringsToLatLng)
  }
  return []
}
