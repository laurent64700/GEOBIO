import { describe, it, expect } from 'vitest'
import {
  bearingUnitVector,
  clipLineToBounds,
  generateTheoreticalLines,
} from './gridGeneration'

describe('bearingUnitVector', () => {
  it('bearing 0 (north) points to (0, 1)', () => {
    const v = bearingUnitVector(0)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(1)
  })

  it('bearing 90 (east) points to (1, 0)', () => {
    const v = bearingUnitVector(90)
    expect(v.x).toBeCloseTo(1)
    expect(v.y).toBeCloseTo(0)
  })
})

describe('clipLineToBounds', () => {
  const bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 }

  it('clips a horizontal line through the origin to the box edges', () => {
    const clipped = clipLineToBounds({ x: 0, y: 0 }, { x: 1, y: 0 }, bounds)
    expect(clipped).not.toBeNull()
    expect(clipped![0]).toEqual({ x: -5, y: 0 })
    expect(clipped![1]).toEqual({ x: 5, y: 0 })
  })

  it('returns null for a line entirely outside the box', () => {
    const clipped = clipLineToBounds({ x: 0, y: 100 }, { x: 1, y: 0 }, bounds)
    expect(clipped).toBeNull()
  })
})

describe('generateTheoreticalLines', () => {
  it('generates axis-a and axis-b line families covering the bounds', () => {
    const template = { spacingXM: 2, spacingYM: 2.5, angleTrueNorthDeg: 0 }
    const origin = { x: 0, y: 0 }
    const bounds = { minX: -3, maxX: 3, minY: -3, maxY: 3 }

    const lines = generateTheoreticalLines(template, origin, bounds)

    const axisA = lines.filter((l) => l.family === 'axis-a')
    const axisB = lines.filter((l) => l.family === 'axis-b')
    expect(axisA).toHaveLength(3) // x = -2.5, 0, 2.5 within [-3, 3]
    expect(axisB).toHaveLength(3) // y = -2, 0, 2 within [-3, 3]

    const central = axisA.find((l) => Math.abs(l.points[0].x) < 1e-9)
    expect(central).toBeDefined()
    expect(central!.points[0]).toEqual({ x: 0, y: -3 })
    expect(central!.points[1]).toEqual({ x: 0, y: 3 })
  })

  it('rotates both families together when angleTrueNorthDeg is set (Curry-style 45°)', () => {
    const template = { spacingXM: 2, spacingYM: 2, angleTrueNorthDeg: 45 }
    const origin = { x: 0, y: 0 }
    const bounds = { minX: -3, maxX: 3, minY: -3, maxY: 3 }

    const lines = generateTheoreticalLines(template, origin, bounds)
    // The central (k=0) axis-a line passes through the origin, but
    // clipLineToBounds returns its box-boundary endpoints, not the origin
    // itself — so identify it by midpoint (which IS the origin for the
    // central line), not by endpoint proximity.
    const central = lines.find((l) => {
      if (l.family !== 'axis-a') return false
      const midX = (l.points[0].x + l.points[1].x) / 2
      const midY = (l.points[0].y + l.points[1].y) / 2
      return Math.hypot(midX, midY) < 1e-6
    })
    expect(central).toBeDefined()
    // At 45°, the line runs along (sin45°, cos45°) clipped to the box —
    // expected endpoints (-3,-3) and (3,3), neither purely vertical nor horizontal.
    expect(Math.abs(central!.points[0].x)).toBeCloseTo(3)
    expect(Math.abs(central!.points[0].y)).toBeCloseTo(3)
    expect(central!.points[0].x).toBeCloseTo(central!.points[0].y)
  })

  it('assigns alternating polarity by grid line index (theoretical convention, not a field measurement)', () => {
    const template = { spacingXM: 2, spacingYM: 2.5, angleTrueNorthDeg: 0 }
    const origin = { x: 0, y: 0 }
    const bounds = { minX: -3, maxX: 3, minY: -3, maxY: 3 }
    const lines = generateTheoreticalLines(template, origin, bounds)

    const axisA = lines.filter((l) => l.family === 'axis-a')
    const central = axisA.find((l) => Math.abs(l.points[0].x) < 1e-9)!
    const nextOver = axisA.find((l) => Math.abs(l.points[0].x - 2.5) < 1e-9)!
    expect(central.polarity).toBe('+')
    expect(nextOver.polarity).toBe('-')
  })
})
