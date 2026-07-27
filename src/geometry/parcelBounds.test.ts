import { describe, it, expect } from 'vitest'
import { boundsOfParcels } from './parcelBounds'
import type { CadastralParcel } from '../data/cadastreService'

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
