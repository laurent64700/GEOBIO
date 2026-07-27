import { describe, it, expect } from 'vitest'
import { metersPerPixel } from './metersPerPixel'

describe('metersPerPixel', () => {
  it('halves as zoom increases by 1 (each zoom level doubles resolution)', () => {
    const at18 = metersPerPixel(44.23, 18)
    const at19 = metersPerPixel(44.23, 19)
    expect(at19).toBeCloseTo(at18 / 2, 6)
  })

  it('matches the known real-world figure at the equator, zoom 0', () => {
    // The textbook constant itself: ~156543 m/pixel at the equator, zoom 0.
    expect(metersPerPixel(0, 0)).toBeCloseTo(156543.03392, 3)
  })

  it('shrinks toward the poles at a fixed zoom (Mercator distortion)', () => {
    expect(metersPerPixel(70, 15)).toBeLessThan(metersPerPixel(10, 15))
  })
})
