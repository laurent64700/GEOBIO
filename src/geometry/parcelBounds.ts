import type { CadastralParcel } from '../data/cadastreService'
import type { StoredParcel } from '../domain/types'
import { localToLatLng, type LatLng } from './localCoordinates'

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

// Same computation as boundsOfParcels, but for the already-persisted LOCAL
// coordinate form (StoredParcel, mission.selectedParcelsGeometry) — needed
// when RESUMING an existing mission, where the original CadastralParcel[]
// (lat/lng, only ever fetched live from IGN at selection time) no longer
// exists in memory; only the converted local coords survive in the DB. Lets
// FitBoundsOnce's minZoom-from-bounds cap apply the same way for a resumed
// mission as for a freshly-confirmed one (Laurent, field testing 08/2026:
// "pense aussi au zoom de base sur ces parcelles definies" — closes the
// previously-accepted gap noted in MapView.tsx's FitBoundsOnce doc comment).
export function boundsOfStoredParcels(parcels: StoredParcel[], missionOrigin: LatLng): SimpleLatLngBounds | null {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity

  for (const parcel of parcels) {
    for (const ring of parcel.rings) {
      for (const point of ring) {
        const { lat, lng } = localToLatLng(point, missionOrigin)
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
        if (lng < minLng) minLng = lng
        if (lng > maxLng) maxLng = lng
      }
    }
  }

  if (!Number.isFinite(minLat)) return null
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ]
}
