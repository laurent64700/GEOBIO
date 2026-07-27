import type { LatLng } from './localCoordinates'

export interface LatLngBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

const METERS_PER_DEG_LAT = 111_320

// A simple equirectangular-approximation bounding box, radiusM in every
// direction from origin. Good enough for the small (hundreds-of-meters)
// search radii this is used for (building/parcel lookups) — not meant for
// anything requiring geodesic precision at larger scales.
export function boundsAround(origin: LatLng, radiusM: number): LatLngBounds {
  const degLat = radiusM / METERS_PER_DEG_LAT
  const degLng = radiusM / (METERS_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180))
  return {
    minLat: origin.lat - degLat,
    maxLat: origin.lat + degLat,
    minLng: origin.lng - degLng,
    maxLng: origin.lng + degLng,
  }
}
