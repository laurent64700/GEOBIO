import type { CadastralParcel } from '../data/cadastreService'

// [[southWestLat, southWestLng], [northEastLat, northEastLng]] — the shape
// Leaflet's LatLngBoundsExpression / map.fitBounds expects.
export type SimpleLatLngBounds = [[number, number], [number, number]]

export function boundsOfParcels(parcels: CadastralParcel[]): SimpleLatLngBounds | null {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity

  for (const parcel of parcels) {
    for (const ring of parcel.ringsLatLng) {
      for (const point of ring) {
        if (point.lat < minLat) minLat = point.lat
        if (point.lat > maxLat) maxLat = point.lat
        if (point.lng < minLng) minLng = point.lng
        if (point.lng > maxLng) maxLng = point.lng
      }
    }
  }

  if (!Number.isFinite(minLat)) return null
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ]
}
