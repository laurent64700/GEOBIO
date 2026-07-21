import { describe, it, expect } from 'vitest'
import { computeSegmentIntersection, computeHartmannCurryCrossings } from './pathogenicCrossings'
import type { GridLine } from '../domain/types'

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

function makeLine(id: string, family: 'axis-a' | 'axis-b', points: { x: number; y: number }[]): GridLine {
  return {
    id,
    gridInstanceId: family === 'axis-a' ? 'hartmann-instance' : 'curry-instance',
    family,
    polarity: '+',
    reinforced: false,
    theoreticalPoints: points,
    adjustedPoints: points,
  }
}

describe('computeHartmannCurryCrossings', () => {
  it('finds one crossing between a straight Hartmann line and a straight Curry line', () => {
    const hartmann = [makeLine('h1', 'axis-a', [{ x: 0, y: -5 }, { x: 0, y: 5 }])]
    const curry = [makeLine('c1', 'axis-b', [{ x: -5, y: 0 }, { x: 5, y: 0 }])]

    const crossings = computeHartmannCurryCrossings(hartmann, curry)

    expect(crossings).toHaveLength(1)
    expect(crossings[0]).toEqual({ point: { x: 0, y: 0 }, hartmannLineId: 'h1', curryLineId: 'c1' })
  })

  it('finds zero crossings when the lines do not meet within their bounds', () => {
    const hartmann = [makeLine('h1', 'axis-a', [{ x: 10, y: -5 }, { x: 10, y: 5 }])]
    const curry = [makeLine('c1', 'axis-b', [{ x: -5, y: 0 }, { x: 5, y: 0 }])]

    expect(computeHartmannCurryCrossings(hartmann, curry)).toHaveLength(0)
  })

  it('finds two crossings when a bent (3-point) Hartmann line crosses a Curry line twice', () => {
    // A Hartmann line bent into a "V" shape around y=0, crossing a horizontal
    // Curry line at two distinct x positions — the exact case that would be
    // silently wrong if the whole line were treated as one segment from its
    // first point (0,-5) to its last point (4,-5), which never crosses y=0 at all.
    const hartmann = [
      makeLine('h1', 'axis-a', [
        { x: 0, y: -5 },
        { x: 2, y: 5 },
        { x: 4, y: -5 },
      ]),
    ]
    const curry = [makeLine('c1', 'axis-b', [{ x: -5, y: 0 }, { x: 10, y: 0 }])]

    const crossings = computeHartmannCurryCrossings(hartmann, curry)

    expect(crossings).toHaveLength(2)
    expect(crossings.every((c) => c.hartmannLineId === 'h1' && c.curryLineId === 'c1')).toBe(true)
  })

  it('finds no crossings when there are no Curry lines', () => {
    const hartmann = [makeLine('h1', 'axis-a', [{ x: 0, y: -5 }, { x: 0, y: 5 }])]
    expect(computeHartmannCurryCrossings(hartmann, [])).toHaveLength(0)
  })
})
