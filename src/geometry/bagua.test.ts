// src/geometry/bagua.test.ts
import { describe, it, expect } from 'vitest'
import { computeCentroid } from './bagua'

describe('computeCentroid', () => {
  it('finds the center of a symmetric square', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    expect(computeCentroid(square)).toEqual({ x: 5, y: 5 })
  })

  it('uses the area-weighted centroid, not the vertex average, on a non-convex L-shape', () => {
    // An L-shaped polygon: a 10x10 square with a 5x5 notch cut from the
    // top-right corner. The vertex average would be pulled toward the notch
    // corner (7 vertices, several clustered near the cut); the true
    // area-centroid sits inside the "meat" of the L, closer to (4.17, 4.17).
    const lShape = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ]
    const centroid = computeCentroid(lShape)
    // Hand-computed via the shoelace-based centroid formula for this exact
    // polygon (area = 75, Cx = Cy = 4.1666...).
    expect(centroid.x).toBeCloseTo(25 / 6, 4)
    expect(centroid.y).toBeCloseTo(25 / 6, 4)

    // The naive vertex average would be (30/6, 30/6) = (5, 5) — distinct
    // enough from the true centroid to catch a wrong-formula regression.
    expect(centroid.x).not.toBeCloseTo(5, 1)
  })
})
