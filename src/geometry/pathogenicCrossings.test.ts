import { describe, it, expect } from 'vitest'
import { computeSegmentIntersection } from './pathogenicCrossings'

describe('computeSegmentIntersection', () => {
  it('finds the intersection of two crossing segments', () => {
    // A vertical segment (0,-5)-(0,5) crossed by a horizontal segment (-5,0)-(5,0)
    const result = computeSegmentIntersection(
      { x: 0, y: -5 }, { x: 0, y: 5 },
      { x: -5, y: 0 }, { x: 5, y: 0 }
    )
    expect(result).toEqual({ x: 0, y: 0 })
  })

  it('returns null for parallel segments', () => {
    const result = computeSegmentIntersection(
      { x: 0, y: 0 }, { x: 0, y: 10 },
      { x: 5, y: 0 }, { x: 5, y: 10 }
    )
    expect(result).toBeNull()
  })

  it('returns null when the lines intersect but outside both segments\' bounds', () => {
    // Same two lines as the first test, but shrunk so they no longer reach (0,0)
    const result = computeSegmentIntersection(
      { x: 0, y: 1 }, { x: 0, y: 5 },
      { x: -5, y: 0 }, { x: -1, y: 0 }
    )
    expect(result).toBeNull()
  })

  it('counts an intersection exactly on a segment endpoint as valid (inclusive bounds)', () => {
    // The crossing point (0,0) is the exact endpoint of the second segment.
    const result = computeSegmentIntersection(
      { x: 0, y: -5 }, { x: 0, y: 5 },
      { x: 0, y: 0 }, { x: 5, y: 0 }
    )
    expect(result).toEqual({ x: 0, y: 0 })
  })

  it('normalizes a -0 result to 0', () => {
    // -0 only arises from this formula in a narrow case: a1 itself is a literal
    // -0, the crossing lands exactly on a1 (t resolves to exact +0), and d1x is
    // negative — then t*d1x is -0 and a1.x + t*d1x is -0 + -0 = -0 under IEEE 754.
    // (An earlier draft of this test used a different, symmetric input that
    // cannot produce -0 under IEEE addition rules — verified vacuous and
    // replaced; this exact input was hand-verified to fail without the
    // `x === 0 ? 0 : x` normalization and pass with it.)
    const result = computeSegmentIntersection(
      { x: -0, y: 0 }, { x: -4, y: 4 },
      { x: 0, y: 0 }, { x: -2, y: 1 }
    )
    expect(result).not.toBeNull()
    expect(Object.is(result!.x, -0)).toBe(false)
  })
})
