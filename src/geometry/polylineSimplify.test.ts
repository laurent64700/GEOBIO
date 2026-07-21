// src/geometry/polylineSimplify.test.ts
import { describe, it, expect } from 'vitest'
import { simplifyByMinDistance } from './polylineSimplify'

describe('simplifyByMinDistance', () => {
  it('keeps the first and last point always', () => {
    const points = [{ x: 0, y: 0 }, { x: 0.001, y: 0 }, { x: 10, y: 10 }]
    const result = simplifyByMinDistance(points, 1)
    expect(result[0]).toEqual({ x: 0, y: 0 })
    expect(result[result.length - 1]).toEqual({ x: 10, y: 10 })
  })

  it('drops points closer than the threshold to the last kept point', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0.1, y: 0 }, // 0.1m from last kept point — dropped (threshold 0.5)
      { x: 0.2, y: 0 }, // 0.2m from last kept point (still x:0,y:0) — dropped
      { x: 1, y: 0 },   // 1m from last kept point — kept
    ]
    const result = simplifyByMinDistance(points, 0.5)
    expect(result).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }])
  })

  it('returns the input unchanged when it has 2 or fewer points', () => {
    expect(simplifyByMinDistance([], 0.5)).toEqual([])
    expect(simplifyByMinDistance([{ x: 0, y: 0 }], 0.5)).toEqual([{ x: 0, y: 0 }])
  })

  it('keeps every point when they are all farther apart than the threshold', () => {
    const points = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }]
    expect(simplifyByMinDistance(points, 0.5)).toEqual(points)
  })
})
