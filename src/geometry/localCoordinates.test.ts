import { describe, it, expect } from 'vitest'
import { latLngToLocal, localToLatLng } from './localCoordinates'

describe('latLngToLocal', () => {
  it('maps the origin itself to (0, 0)', () => {
    const origin = { lat: 48.8566, lng: 2.3522 }
    expect(latLngToLocal(origin, origin)).toEqual({ x: 0, y: 0 })
  })

  it('1/1000 degree of latitude is ~111.32 m north', () => {
    const origin = { lat: 0, lng: 0 }
    const p = latLngToLocal({ lat: 0.001, lng: 0 }, origin)
    expect(p.y).toBeCloseTo(111.32, 1)
    expect(p.x).toBeCloseTo(0)
  })

  it('scales longitude by cos(latitude) at non-equatorial origins', () => {
    const origin = { lat: 48.8566, lng: 2.3522 }
    const p = latLngToLocal({ lat: 48.8566, lng: 2.3522 + 0.001 }, origin)
    const expectedMetersPerDegLng = 111320 * Math.cos((48.8566 * Math.PI) / 180)
    expect(p.x).toBeCloseTo(expectedMetersPerDegLng * 0.001, 1)
    expect(p.y).toBeCloseTo(0)
  })
})

describe('localToLatLng', () => {
  it('round-trips with latLngToLocal', () => {
    const origin = { lat: 48.8566, lng: 2.3522 }
    const original = { lat: 48.858, lng: 2.355 }
    const back = localToLatLng(latLngToLocal(original, origin), origin)
    expect(back.lat).toBeCloseTo(original.lat, 9)
    expect(back.lng).toBeCloseTo(original.lng, 9)
  })
})
