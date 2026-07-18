import { describe, it, expect } from 'vitest'
import { computeGuideLineEndpoints } from './guideLine'

describe('computeGuideLineEndpoints', () => {
  it('extends a N/S (0°) line symmetrically through the anchor', () => {
    const [a, b] = computeGuideLineEndpoints({ x: 5, y: 5 }, 0, 60)
    expect(a).toEqual({ x: 5, y: -55 })
    expect(b).toEqual({ x: 5, y: 65 })
  })

  it('extends a 45° line symmetrically through the anchor', () => {
    const [a, b] = computeGuideLineEndpoints({ x: 0, y: 0 }, 45, Math.SQRT2 * 10)
    expect(a.x).toBeCloseTo(-10)
    expect(a.y).toBeCloseTo(-10)
    expect(b.x).toBeCloseTo(10)
    expect(b.y).toBeCloseTo(10)
  })
})
