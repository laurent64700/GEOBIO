import { describe, it, expect } from 'vitest'
import {
  lineBearingDeg,
  angularDeviationDeg,
  suggestOrthogonalStraighten,
  getOrthogonalitySuggestion,
} from './orthogonality'

describe('lineBearingDeg', () => {
  it('a line running due north has bearing 0', () => {
    expect(lineBearingDeg([{ x: 0, y: 0 }, { x: 0, y: 10 }])).toBeCloseTo(0)
  })

  it('a line running due east has bearing 90', () => {
    expect(lineBearingDeg([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBeCloseTo(90)
  })
})

describe('angularDeviationDeg', () => {
  it('small deviations return their signed difference', () => {
    expect(angularDeviationDeg(5, 0)).toBeCloseTo(5)
  })

  it('compares mod 180 since a line has no directional sign', () => {
    // 170° actual vs 0° theoretical is really only 10° off (the "other end" of the line)
    expect(angularDeviationDeg(170, 0)).toBeCloseTo(-10)
  })
})

describe('suggestOrthogonalStraighten', () => {
  it('produces a straightened segment matching the theoretical bearing, preserving centroid and length', () => {
    const points = [{ x: 0, y: 0 }, { x: 2, y: 10 }]
    const suggested = suggestOrthogonalStraighten(points, 0) // theoretical: due north

    expect(suggested[0].x).toBeCloseTo(1) // centroid.x preserved
    expect(suggested[1].x).toBeCloseTo(1)
    const originalLength = Math.hypot(2, 10)
    const suggestedLength = Math.hypot(
      suggested[1].x - suggested[0].x,
      suggested[1].y - suggested[0].y
    )
    expect(suggestedLength).toBeCloseTo(originalLength)
  })
})

describe('getOrthogonalitySuggestion', () => {
  it('computes deviation against axis-b (perpendicular, +90°) for a near-east-west line', () => {
    const template = { angleTrueNorthDeg: 0 }
    const points = [{ x: 0, y: 0 }, { x: 10, y: 1 }] // nearly east-west, slightly tilted
    const result = getOrthogonalitySuggestion(points, 'axis-b', template)

    // atan2(10, 1) in degrees ≈ 84.29 ; theoretical axis-b bearing = 0 + 90 = 90
    expect(result.deviationDeg).toBeCloseTo(-5.71, 1)
    expect(result.suggestedPoints).toHaveLength(2)
  })
})
