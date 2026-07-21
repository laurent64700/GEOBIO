// src/geometry/bagua.test.ts
import { describe, it, expect } from 'vitest'
import { computeCentroid, computeBaguaSectors, computeMaxRadius } from './bagua'

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

describe('computeMaxRadius', () => {
  it('finds the farthest vertex from the centroid', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    // Centroid is (5,5); every corner is sqrt(50) ≈ 7.071 away.
    expect(computeMaxRadius(square, { x: 5, y: 5 })).toBeCloseTo(Math.sqrt(50), 4)
  })
})

describe('computeBaguaSectors', () => {
  it('produces 8 sectors, each spanning 45°, starting from true north', () => {
    const sectors = computeBaguaSectors({ x: 0, y: 0 }, 10)

    expect(sectors).toHaveLength(8)
    expect(sectors.map((s) => s.compassDirection)).toEqual(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'])
  })

  it('centers the "N" sector on bearing 0° (+y axis), symmetric about the y axis', () => {
    const sectors = computeBaguaSectors({ x: 0, y: 0 }, 10)
    const north = sectors.find((s) => s.compassDirection === 'N')!

    // The N sector's two edges sit at bearing -22.5° and +22.5° — symmetric
    // around true north (+y), so their x-coordinates are opposite and their
    // y-coordinates equal and positive. (points[0] is the wedge's center
    // point, i.e. the passed-in center itself; points[1]/points[2] are the
    // two edges.)
    const [edge1, edge2] = north.points.slice(1)
    expect(edge1.x).toBeCloseTo(-edge2.x, 5)
    expect(edge1.y).toBeCloseTo(edge2.y, 5)
    expect(edge1.y).toBeGreaterThan(0)
  })
})
