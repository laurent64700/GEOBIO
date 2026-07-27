import { describe, it, expect } from 'vitest'
import { lineWeightForZoom } from './lineWeightForZoom'
import { metersPerPixel } from './metersPerPixel'

describe('lineWeightForZoom', () => {
  it('converts a real-world width to the pixel count that represents it at a given zoom', () => {
    const mpp = metersPerPixel(44.23, 21)
    const weight = lineWeightForZoom(0.21, 44.23, 21, false)
    expect(weight).toBeCloseTo(0.21 / mpp, 6)
  })

  it('renders wider at a higher zoom for the same real width (opposite of the old fixed-px behavior)', () => {
    const low = lineWeightForZoom(0.21, 44.23, 15, false)
    const high = lineWeightForZoom(0.21, 44.23, 21, false)
    expect(high).toBeGreaterThan(low)
  })

  it('renders a reinforced line 1.5x wider than a normal one at the same zoom', () => {
    const normal = lineWeightForZoom(0.4, 44.23, 20, false)
    const reinforced = lineWeightForZoom(0.4, 44.23, 20, true)
    expect(reinforced).toBeCloseTo(normal * 1.5, 6)
  })

  it('never drops below a 1px floor when zoomed far out', () => {
    expect(lineWeightForZoom(0.21, 44.23, 5, false)).toBe(1)
  })
})
