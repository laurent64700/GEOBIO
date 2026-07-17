import type { Point } from '../domain/types'

const METERS_PER_DEG_LAT = 111_320

export interface LatLng {
  lat: number
  lng: number
}

/**
 * Converts a WGS84 lat/lng to mission-local planar meters (x = east, y =
 * north) relative to `origin`, using an equirectangular approximation. This
 * is accurate to within centimeters over distances of a few hundred meters —
 * comfortably sufficient for a residential property (spec §3.1's local
 * metric referential). It is deliberately NOT a geodesy-grade projection
 * (no ellipsoid correction) — do not reuse this for anything beyond a single
 * property's local referential.
 */
export function latLngToLocal(point: LatLng, origin: LatLng): Point {
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180)
  return {
    x: (point.lng - origin.lng) * metersPerDegLng,
    y: (point.lat - origin.lat) * METERS_PER_DEG_LAT,
  }
}

export function localToLatLng(point: Point, origin: LatLng): LatLng {
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180)
  return {
    lat: origin.lat + point.y / METERS_PER_DEG_LAT,
    lng: origin.lng + point.x / metersPerDegLng,
  }
}
