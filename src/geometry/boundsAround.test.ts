import { describe, it, expect } from 'vitest'
import { boundsAround } from './boundsAround'

describe('boundsAround', () => {
  it('returns a symmetric box around the origin, wider in longitude near the equator-adjacent latitudes get narrower', () => {
    const origin = { lat: 48.8566, lng: 2.3522 }
    const bounds = boundsAround(origin, 100)

    expect(bounds.minLat).toBeLessThan(origin.lat)
    expect(bounds.maxLat).toBeGreaterThan(origin.lat)
    expect(bounds.minLng).toBeLessThan(origin.lng)
    expect(bounds.maxLng).toBeGreaterThan(origin.lng)
    // Latitude degrees are ~constant in meters, so the lat span shouldn't
    // depend on longitude convergence the way the lng span does.
    expect(bounds.maxLat - origin.lat).toBeCloseTo(origin.lat - bounds.minLat, 10)
  })

  it('produces a wider longitude span near the poles than near the equator, for the same radius', () => {
    const nearEquator = boundsAround({ lat: 1, lng: 0 }, 1000)
    const nearPole = boundsAround({ lat: 70, lng: 0 }, 1000)

    const equatorLngSpan = nearEquator.maxLng - nearEquator.minLng
    const poleLngSpan = nearPole.maxLng - nearPole.minLng

    expect(poleLngSpan).toBeGreaterThan(equatorLngSpan)
  })
})
