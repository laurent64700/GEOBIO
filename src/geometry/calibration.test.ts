import { describe, it, expect } from 'vitest'
import { calibratePlan, CalibrationError } from './calibration'

describe('calibratePlan', () => {
  it('fits a similarity transform (rotation + scale + translation) from 2 control points', () => {
    // Real-world mapping being fit: x' = -py + 10, y' = px + 20
    // (a 90° rotation, scale 1, translated by (10, 20))
    const transform = calibratePlan([
      { image: { x: 0, y: 0 }, real: { x: 10, y: 20 } },
      { image: { x: 10, y: 0 }, real: { x: 10, y: 30 } },
    ])

    expect(transform.a).toBeCloseTo(0)
    expect(transform.b).toBeCloseTo(-1)
    expect(transform.c).toBeCloseTo(1)
    expect(transform.d).toBeCloseTo(0)
    expect(transform.e).toBeCloseTo(10)
    expect(transform.f).toBeCloseTo(20)
  })

  it('rejects fewer than 2 control points', () => {
    expect(() =>
      calibratePlan([{ image: { x: 0, y: 0 }, real: { x: 0, y: 0 } }])
    ).toThrow(CalibrationError)
  })

  it('rejects control points closer than 2 meters apart in real space', () => {
    expect(() =>
      calibratePlan([
        { image: { x: 0, y: 0 }, real: { x: 0, y: 0 } },
        { image: { x: 10, y: 0 }, real: { x: 1, y: 0 } },
      ])
    ).toThrow(CalibrationError)
  })
})
