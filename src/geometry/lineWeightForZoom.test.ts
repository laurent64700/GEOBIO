import { describe, it, expect } from 'vitest'
import { lineWeightForZoom } from './lineWeightForZoom'
import { metersPerPixel } from './metersPerPixel'

describe('lineWeightForZoom', () => {
  it('converts a real-world width to the pixel count that represents it at a given zoom', () => {
    // zoom 20, not 21: at zoom 21 this exact width/zoom combination already
    // exceeds the 3px ceiling below (~3.93px unclamped), which would clamp
    // the result and defeat the point of this test — checking the pure
    // conversion math, not the ceiling.
    const mpp = metersPerPixel(44.23, 20)
    const weight = lineWeightForZoom(0.21, 44.23, 20, false)
    expect(weight).toBeCloseTo(0.21 / mpp, 6)
  })

  it('renders wider at a higher zoom for the same real width (opposite of the old fixed-px behavior)', () => {
    const low = lineWeightForZoom(0.21, 44.23, 15, false)
    const high = lineWeightForZoom(0.21, 44.23, 21, false)
    expect(high).toBeGreaterThan(low)
  })

  it('renders a reinforced line 1.5x wider than a normal one at the same zoom', () => {
    // zoom 19, not 20: at zoom 20 the reinforced value alone (0.4m * 1.5)
    // already exceeds the 3px ceiling below, which would clamp it and mask
    // the 1.5x ratio this test exists to check — zoom 19 keeps both values
    // comfortably under the ceiling.
    const normal = lineWeightForZoom(0.4, 44.23, 19, false)
    const reinforced = lineWeightForZoom(0.4, 44.23, 19, true)
    expect(reinforced).toBeCloseTo(normal * 1.5, 6)
  })

  it('never drops below a 1px floor when zoomed far out', () => {
    expect(lineWeightForZoom(0.21, 44.23, 5, false)).toBe(1)
  })

  it('never exceeds a 3px ceiling at high zoom, even for a wide reinforced network line', () => {
    // Reported by Laurent from live field testing (08/2026): true-to-scale
    // width is correct in principle, but at high zoom a wide/reinforced
    // network's grid rendered as a dense, near-solid block of color ("grille
    // trop présente") — legible reference lines matter more here than exact
    // physical width, which the flat FeltSegmentsLayer already didn't try to
    // represent either (real felt segments use a plain fixed weight, not
    // this real-width conversion at all).
    // Unclamped this would be ~11.2px (0.4m * 1.5 / metersPerPixel(44.23, 21))
    expect(lineWeightForZoom(0.4, 44.23, 21, true)).toBe(3)
  })
})
