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

  it('builds the BBOX in lat,lng axis order (per WFS 2.0.0 + EPSG:4326 convention)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleGeoJson),
    } as Response)

    await fetchParcelsInBounds({ minLat: 48.85, maxLat: 48.86, minLng: 2.35, maxLng: 2.36 })

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('BBOX=48.85,2.35,48.86,2.36,EPSG:4326')
  })

  it('parses a MultiPolygon parcel into one entry per disjoint part, sharing id/section', async () => {
    // PARCELLAIRE_EXPRESS can legitimately return MultiPolygon for a parcel
    // with several disjoint parts; the old Polygon-only parser silently
    // produced array-valued lat/lng (NaN downstream) on that input.
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { numero: '2042', section: 'ZC' },
              geometry: {
                type: 'MultiPolygon',
                coordinates: [
                  [
                    [
                      [2.35, 48.85],
                      [2.351, 48.85],
                      [2.351, 48.851],
                      [2.35, 48.85],
                    ],
                  ],
                  [
                    [
                      [2.36, 48.86],
                      [2.361, 48.86],
                      [2.361, 48.861],
                      [2.36, 48.86],
                    ],
                  ],
                ],
              },
            },
          ],
        }),
    } as Response)

    const parcels = await fetchParcelsInBounds({ minLat: 48.85, maxLat: 48.87, minLng: 2.35, maxLng: 2.37 })

    expect(parcels).toHaveLength(2)
    for (const parcel of parcels) {
      expect(parcel.id).toBe('2042')
      expect(parcel.section).toBe('ZC')
      for (const ring of parcel.ringsLatLng) {
        for (const { lat, lng } of ring) {
          expect(Number.isFinite(lat)).toBe(true)
          expect(Number.isFinite(lng)).toBe(true)
        }
      }
    }
    expect(parcels[0].ringsLatLng[0][0]).toEqual({ lat: 48.85, lng: 2.35 })
    expect(parcels[1].ringsLatLng[0][0]).toEqual({ lat: 48.86, lng: 2.36 })
  })

  it('throws a descriptive French error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)

    await expect(
      fetchParcelsInBounds({ minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 })
    ).rejects.toThrow('Impossible de charger les parcelles cadastrales : 500')
  })

  it('forwards an AbortSignal to fetch when one is passed', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleGeoJson),
    } as Response)
    const controller = new AbortController()

    await fetchParcelsInBounds({ minLat: 48.85, maxLat: 48.86, minLng: 2.35, maxLng: 2.36 }, controller.signal)

    expect(fetch).toHaveBeenCalledWith(expect.any(String), { signal: controller.signal })
  })
})
