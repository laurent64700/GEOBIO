import { describe, it, expect } from 'vitest'
import type { Point, GridTemplate, GridLine } from './types'

describe('domain types', () => {
  it('Point has numeric x/y', () => {
    const p: Point = { x: 1.5, y: -2.25 }
    expect(p.x).toBe(1.5)
    expect(p.y).toBe(-2.25)
  })

  it('GridLine family is restricted to axis-a or axis-b', () => {
    const line: GridLine = {
      id: '1',
      gridInstanceId: '1',
      family: 'axis-a',
      polarity: '+',
      reinforced: false,
      theoreticalPoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      adjustedPoints: [{ x: 0, y: 0 }, { x: 10, y: 0.3 }],
    }
    expect(line.family).toBe('axis-a')
  })

  it('GridTemplate has spacing, angle and origin offset fields', () => {
    const template: GridTemplate = {
      id: '1',
      name: 'Hartmann',
      spacingXM: 2,
      spacingYM: 2.5,
      angleTrueNorthDeg: 0,
      originOffsetX: 0,
      originOffsetY: 0,
      color: '#d32f2f',
      vibratoryBase: 7,
    }
    expect(template.spacingXM).toBe(2)
  })
})
