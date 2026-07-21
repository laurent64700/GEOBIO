// src/vision/arucoMapping.test.ts
import { describe, it, expect } from 'vitest'
import { mapDetectionsToPoints, pairIntoSegmentsAndPoints } from './arucoMapping'
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
      { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 105, y: 205 }, // centroid (5,5) + (100,200)
      { markerId: 201, rodNumber: 1, networkName: 'Curry', x: 125, y: 205 }, // centroid (25,5) + (100,200)
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

describe('pairIntoSegmentsAndPoints', () => {
  it('pairs 2 recognized points of the same rod into a segment', () => {
    const result = pairIntoSegmentsAndPoints([
      { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 0, y: 0 },
      { markerId: 102, rodNumber: 1, networkName: 'Hartmann', x: 4, y: 0 },
    ])

    expect(result.segments).toEqual([
      { networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 } },
    ])
    expect(result.points).toEqual([])
  })

  it('keeps a lone recognized point as a point, not a segment', () => {
    const result = pairIntoSegmentsAndPoints([
      { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 0, y: 0 },
    ])

    expect(result.segments).toEqual([])
    expect(result.points).toEqual([
      { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 0, y: 0 },
    ])
  })

  it('does not merge points from different rods or different networks', () => {
    const result = pairIntoSegmentsAndPoints([
      { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 0, y: 0 },
      { markerId: 201, rodNumber: 2, networkName: 'Hartmann', x: 10, y: 10 }, // different rod, same network
      { markerId: 301, rodNumber: 1, networkName: 'Curry', x: 20, y: 20 }, // same rod number, different network
    ])

    expect(result.segments).toEqual([])
    expect(result.points).toHaveLength(3)
  })

  it('dedups a marker detected twice in the same frame before pairing', () => {
    const result = pairIntoSegmentsAndPoints([
      { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 0, y: 0 },
      { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 0.01, y: 0.01 }, // duplicate detection, slightly different centroid
      { markerId: 102, rodNumber: 1, networkName: 'Hartmann', x: 4, y: 0 },
    ])

    // Without dedup this would be a 3-point group; with dedup it's exactly one
    // segment from markers 101 and 102, using the FIRST occurrence of 101.
    expect(result.segments).toEqual([
      { networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 } },
    ])
    expect(result.points).toEqual([])
  })

  it('defensively takes the 2 lowest marker IDs if a group somehow has 3+ distinct markers', () => {
    // Not expected to occur with correctly-seeded rod_marker data (each rod
    // has exactly 2 distinct marker IDs by construction), but the grouping
    // itself has no schema-enforced cap — stay correct if it ever does.
    const result = pairIntoSegmentsAndPoints([
      { markerId: 103, rodNumber: 1, networkName: 'Hartmann', x: 8, y: 8 },
      { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 0, y: 0 },
      { markerId: 102, rodNumber: 1, networkName: 'Hartmann', x: 4, y: 0 },
    ])

    expect(result.segments).toEqual([
      { networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 } },
    ])
    expect(result.points).toEqual([])
  })
})
