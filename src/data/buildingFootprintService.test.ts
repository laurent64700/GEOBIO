// src/data/buildingFootprintService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchBuildingsInBounds } from './buildingFootprintService'

const sampleGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 'BATIMENT0000001234' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2.35, 48.85],
            [2.3502, 48.85],
            [2.3502, 48.8502],
            [2.35, 48.8502],
            [2.35, 48.85],
          ],
        ],
      },
    },
  ],
}

describe('fetchBuildingsInBounds', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('parses building features into ringsLatLng, using lat,lng BBOX axis order', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleGeoJson),
    } as Response)

    const buildings = await fetchBuildingsInBounds({ minLat: 48.85, maxLat: 48.86, minLng: 2.35, maxLng: 2.36 })

    expect(buildings).toHaveLength(1)
    expect(buildings[0].ringsLatLng[0][0]).toEqual({ lat: 48.85, lng: 2.35 })

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('TYPENAME=BDTOPO_V3:batiment')
    expect(calledUrl).toContain('BBOX=48.85,2.35,48.86,2.36,EPSG:4326')
  })

  it('throws a descriptive French error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)

    await expect(
      fetchBuildingsInBounds({ minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 })
    ).rejects.toThrow('Impossible de charger les bâtiments : 500')
  })

  it('forwards an AbortSignal to fetch when one is passed', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleGeoJson),
    } as Response)
    const controller = new AbortController()

    await fetchBuildingsInBounds({ minLat: 48.85, maxLat: 48.86, minLng: 2.35, maxLng: 2.36 }, controller.signal)

    expect(fetch).toHaveBeenCalledWith(expect.any(String), { signal: controller.signal })
  })
})
