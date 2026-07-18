// src/data/cadastreService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchParcelsInBounds } from './cadastreService'

const sampleGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { numero: '1167', section: 'AB' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2.35, 48.85],
            [2.351, 48.85],
            [2.351, 48.851],
            [2.35, 48.851],
            [2.35, 48.85],
          ],
        ],
      },
    },
  ],
}

describe('fetchParcelsInBounds', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('parses parcel features into id/section/ringsLatLng', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleGeoJson),
    } as Response)

    const parcels = await fetchParcelsInBounds({ minLat: 48.85, maxLat: 48.86, minLng: 2.35, maxLng: 2.36 })

    expect(parcels).toHaveLength(1)
    expect(parcels[0].id).toBe('1167')
    expect(parcels[0].section).toBe('AB')
    expect(parcels[0].ringsLatLng[0][0]).toEqual({ lat: 48.85, lng: 2.35 })
  })

  it('throws a descriptive French error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)

    await expect(
      fetchParcelsInBounds({ minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 })
    ).rejects.toThrow('Impossible de charger les parcelles cadastrales : 500')
  })
})
