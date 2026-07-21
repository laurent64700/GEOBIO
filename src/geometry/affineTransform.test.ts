// src/geometry/affineTransform.test.ts
import { describe, it, expect } from 'vitest'
import { applyAffineTransform } from './affineTransform'

describe('applyAffineTransform', () => {
  it('applies a pure translation', () => {
    const result = applyAffineTransform(
      { x: 2, y: 4 },
      { a: 1, b: 0, c: 0, d: 1, e: 5, f: -3 }
    )
    expect(result).toEqual({ x: 7, y: 1 })
  })

  it('applies the exact 90°-rotation transform calibratePlan itself produces (Plan 1, Chunk 2 Task 6)', () => {
    // transform = {a:0,b:-1,c:1,d:0,e:10,f:20} is calibratePlan's own committed
    // test fixture for a 90° rotation, scale 1, translate (10,20).
    const result = applyAffineTransform(
      { x: 5, y: 3 },
      { a: 0, b: -1, c: 1, d: 0, e: 10, f: 20 }
    )
    // x' = 0*5 + (-1)*3 + 10 = 7 ; y' = 1*5 + 0*3 + 20 = 25
    expect(result).toEqual({ x: 7, y: 25 })
  })
})
