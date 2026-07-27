import { describe, it, expect } from 'vitest'
import { intersectSegmentLines } from './segmentIntersection'

describe('intersectSegmentLines', () => {
  it('finds the crossing point of two perpendicular segments', () => {
    const a = { pointA: { x: -1, y: 5 }, pointB: { x: 1, y: 5 } } // horizontal, at y=5
    const b = { pointA: { x: 3, y: 4 }, pointB: { x: 3, y: 6 } } // vertical, at x=3
    expect(intersectSegmentLines(a, b)).toEqual({ x: 3, y: 5 })
  })

  it('extends beyond the finite segments to find the crossing (segments need not physically overlap)', () => {
    // Neither segment passes anywhere near (10, 10), but their infinite lines do.
    const a = { pointA: { x: 0, y: 10 }, pointB: { x: 1, y: 10 } }
    const b = { pointA: { x: 10, y: 0 }, pointB: { x: 10, y: 1 } }
    expect(intersectSegmentLines(a, b)).toEqual({ x: 10, y: 10 })
  })

  it('returns null for parallel segments', () => {
    const a = { pointA: { x: 0, y: 0 }, pointB: { x: 1, y: 0 } }
    const b = { pointA: { x: 0, y: 5 }, pointB: { x: 1, y: 5 } }
    expect(intersectSegmentLines(a, b)).toBeNull()
  })

  it('returns null when the two segments are nearly parallel (below the 10° trust threshold)', () => {
    const a = { pointA: { x: 0, y: 0 }, pointB: { x: 10, y: 0 } } // 0°
    const b = { pointA: { x: 0, y: 1 }, pointB: { x: 10, y: 1.5 } } // ~2.9° off horizontal
    expect(intersectSegmentLines(a, b)).toBeNull()
  })

  it('finds a real crossing for two segments at a non-perpendicular but trustworthy angle', () => {
    const a = { pointA: { x: 0, y: 0 }, pointB: { x: 10, y: 0 } } // horizontal, y=0
    const b = { pointA: { x: 5, y: -5 }, pointB: { x: 5.5, y: 5 } } // steep, crosses near x=5
    const result = intersectSegmentLines(a, b)
    expect(result).not.toBeNull()
    expect(result!.y).toBeCloseTo(0, 6)
  })
})
