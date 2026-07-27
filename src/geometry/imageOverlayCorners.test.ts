import { describe, it, expect } from 'vitest'
import { computeOverlayCorners } from './imageOverlayCorners'
import type { AffineTransform } from '../domain/types'

describe('computeOverlayCorners', () => {
  it('identity transform: corners land exactly on the image pixel coordinates', () => {
    const identity: AffineTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
    const corners = computeOverlayCorners(identity, 800, 600)
    expect(corners.topLeft).toEqual({ x: 0, y: 0 })
    expect(corners.topRight).toEqual({ x: 800, y: 0 })
    expect(corners.bottomLeft).toEqual({ x: 0, y: 600 })
  })

  it('a 2x-scale, 90°-rotation, translated transform places corners consistently with calibratePlan\'s own convention', () => {
    // Same convention as calibration.test.ts: x'=a*x-b*y+tx, y'=b*x+a*y+ty,
    // with a=0,b=2 (90° rotation, scale 2) and translation (10,20).
    const transform: AffineTransform = { a: 0, b: -2, c: 2, d: 0, e: 10, f: 20 }
    const corners = computeOverlayCorners(transform, 100, 50)
    expect(corners.topLeft).toEqual({ x: 10, y: 20 })
    expect(corners.topRight).toEqual({ x: 10, y: 220 }) // (100,0) -> scale/rotate/translate
    expect(corners.bottomLeft).toEqual({ x: -90, y: 20 })
  })
})
