import { describe, it, expect } from 'vitest'
import { boundsOfParcels, boundsOfStoredParcels } from './parcelBounds'
import type { CadastralParcel } from '../data/cadastreService'
import type { StoredParcel } from '../domain/types'
import { localToLatLng } from './localCoordinates'

describe('boundsOfParcels', () => {
  it('returns null for an empty parcel list', () => {
    expect(boundsOfParcels([])).toBeNull()
  })

  it('returns the tight bounding box around every point of every ring, across all given parcels', () => {
    const parcels: CadastralParcel[] = [
      { id: 'A', section: 'A', ringsLatLng: [[{ lat: 48.85, lng: 2.35 }, { lat: 48.86, lng: 2.36 }]] },
      { id: 'B', section: 'A', ringsLatLng: [[{ lat: 48.84, lng: 2.37 }, { lat: 48.855, lng: 2.34 }]] },
    ]
    expect(boundsOfParcels(parcels)).toEqual([
      [48.84, 2.34],
      [48.86, 2.37],
    ])
  })

  it('handles a multi-part (MultiPolygon) parcel split across several entries sharing one id', () => {
    const parts: CadastralParcel[] = [
      { id: 'C', section: 'B', ringsLatLng: [[{ lat: 48.80, lng: 2.30 }]] },
      { id: 'C', section: 'B', ringsLatLng: [[{ lat: 48.90, lng: 2.40 }]] },
    ]
    expect(boundsOfParcels(parts)).toEqual([
      [48.80, 2.30],
      [48.90, 2.40],
    ])
  })
})

describe('boundsOfStoredParcels', () => {
  // Used to close the "resumed mission has no fitBounds/minZoom cap" gap —
  // same computation as boundsOfParcels, but for the already-persisted
  // LOCAL coordinate form (mission.selectedParcelsGeometry), converted back
  // to lat/lng around the mission origin.
  const origin = { lat: 48.8566, lng: 2.3522 }

  it('returns null for an empty parcel list', () => {
    expect(boundsOfStoredParcels([], origin)).toBeNull()
  })

  it('returns the tight bounding box around every point of every ring, converted to lat/lng around the mission origin', () => {
    const parcels: StoredParcel[] = [
      { id: 'A', section: 'A', rings: [[{ x: -10, y: 5 }, { x: 20, y: -15 }]] },
    ]
    const p1 = localToLatLng({ x: -10, y: 5 }, origin)
    const p2 = localToLatLng({ x: 20, y: -15 }, origin)

    const bounds = boundsOfStoredParcels(parcels, origin)
    expect(bounds).not.toBeNull()
    const [[minLat, minLng], [maxLat, maxLng]] = bounds!
    expect(minLat).toBeCloseTo(Math.min(p1.lat, p2.lat), 9)
    expect(maxLat).toBeCloseTo(Math.max(p1.lat, p2.lat), 9)
    expect(minLng).toBeCloseTo(Math.min(p1.lng, p2.lng), 9)
    expect(maxLng).toBeCloseTo(Math.max(p1.lng, p2.lng), 9)
  })

  it('handles a multi-part parcel split across several entries sharing one id', () => {
    const parts: StoredParcel[] = [
      { id: 'C', section: 'B', rings: [[{ x: 0, y: 0 }]] }, // maps exactly onto the origin
      { id: 'C', section: 'B', rings: [[{ x: 50, y: 50 }]] },
    ]
    const bounds = boundsOfStoredParcels(parts, origin)
    expect(bounds).not.toBeNull()
    expect(bounds![0]).toEqual([origin.lat, origin.lng])
  })
})
