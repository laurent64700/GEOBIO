// src/vision/arucoMapping.test.ts
import { describe, it, expect } from 'vitest'
import { mapDetectionsToPoints } from './arucoMapping'
import type { RodMarker } from '../domain/types'

const rodMarkers: RodMarker[] = [
  { markerId: 101, networkName: 'Hartmann', rodNumber: 1 },
  { markerId: 102, networkName: 'Hartmann', rodNumber: 1 },
  { markerId: 201, networkName: 'Curry', rodNumber: 1 },
]

// Pure translation transform for simplicity: real = pixel + (100, 200)
const calibration = { a: 1, b: 0, c: 0, d: 1, e: 100, f: 200 }

describe('mapDetectionsToPoints', () => {
  it('maps each recognized marker to a real-world point tagged with its network', () => {
    const result = mapDetectionsToPoints(
      [
        { markerId: 101, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
        { markerId: 201, corners: [{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 20, y: 10 }] },
      ],
      calibration,
      rodMarkers
    )

    expect(result.totalDetected).toBe(2)
    expect(result.totalRecognized).toBe(2)
    expect(result.recognized).toEqual([
      { networkName: 'Hartmann', x: 105, y: 205 }, // centroid (5,5) + (100,200)
      { networkName: 'Curry', x: 125, y: 205 }, // centroid (25,5) + (100,200)
    ])
  })

  it('skips markers not present in the rod_marker lookup, without crashing', () => {
    const result = mapDetectionsToPoints(
      [{ markerId: 999, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }],
      calibration,
      rodMarkers
    )

    expect(result.totalDetected).toBe(1)
    expect(result.totalRecognized).toBe(0)
    expect(result.recognized).toEqual([])
  })

  it('handles an empty detection list', () => {
    const result = mapDetectionsToPoints([], calibration, rodMarkers)
    expect(result).toEqual({ recognized: [], totalDetected: 0, totalRecognized: 0 })
  })
})
