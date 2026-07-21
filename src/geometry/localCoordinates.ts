import type { Point } from '../domain/types'

const METERS_PER_DEG_LAT = 111_320

export interface LatLng {
  lat: number
  lng: number
}

/**
 * Converts a WGS84 lat/lng to mission-local planar meters (x = east, y =
 * north) relative to `origin`, using an equirectangular approximation. The
 * flattening error (holding cos(origin.lat) constant across the extent) is
 * sub-centimeter over a few hundred meters. Note the fixed 111_320 m/degree
 * constant is the WGS84 equatorial value, not a latitude-specific one, so
 * absolute scale carries a systematic ~0.1-0.2% error (decimeter-level at a
 * few hundred meters) — fine for a self-consistent local referential
 * (round-trips are numerically exact), but don't treat local-frame lengths
 * as survey-grade absolute distances. Do not reuse this for anything beyond
 * a single property's local referential.
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
