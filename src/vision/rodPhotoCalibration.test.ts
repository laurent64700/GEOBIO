// src/vision/rodPhotoCalibration.test.ts
import { describe, it, expect } from 'vitest'
import { groupRodsInPixelSpace, deriveScale, NoCompleteRodError } from './rodPhotoCalibration'
import type { RawMarkerDetection, FeltSegmentCandidate } from './arucoMapping'
import type { RodMarker } from '../domain/types'

describe('groupRodsInPixelSpace', () => {
  it('groups markers into pixel-space segments — the identity transform means x,y stay the raw pixel centroids', () => {
    const detections: RawMarkerDetection[] = [
      { markerId: 101, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
      { markerId: 102, corners: [{ x: 40, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 10 }, { x: 40, y: 10 }] },
    ]
    const rodMarkers: RodMarker[] = [
      { markerId: 101, networkName: 'Hartmann', rodNumber: 1 },
      { markerId: 102, networkName: 'Hartmann', rodNumber: 1 },
    ]

    const result = groupRodsInPixelSpace(detections, rodMarkers)

    expect(result.segments).toHaveLength(1)
    // Marker 101's corners average to (5, 5); marker 102's to (45, 5) —
    // the identity transform must leave these exactly as-is (pixel space,
    // not "real" coordinates).
    expect(result.segments[0]).toEqual({
      networkName: 'Hartmann',
      pointA: { x: 5, y: 5 },
      pointB: { x: 45, y: 5 },
    })
    expect(result.points).toHaveLength(0)
  })

  it('returns an isolated marker as a point when its rod pair is not detected', () => {
    const detections: RawMarkerDetection[] = [
      { markerId: 101, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
    ]
    const rodMarkers: RodMarker[] = [{ markerId: 101, networkName: 'Hartmann', rodNumber: 1 }]

    const result = groupRodsInPixelSpace(detections, rodMarkers)

    expect(result.segments).toHaveLength(0)
    expect(result.points).toEqual([{ markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 5, y: 5 }])
  })
})

describe('deriveScale', () => {
  it('converts a pixel distance to meters-per-pixel — NOT pixels-per-meter (the inverse)', () => {
    // A rod measured at 50px between its 2 markers, representing a real 1m —
    // scale must be 1/50 = 0.02 (m/px), not 50 (px/m). This is the exact
    // direction bug caught in spec review — pin it explicitly.
    const segments: FeltSegmentCandidate[] = [
      { networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 50, y: 0 } },
    ]
    expect(deriveScale(segments)).toBeCloseTo(0.02, 10)
  })

  it('averages the scale estimate across multiple complete rods', () => {
    const segments: FeltSegmentCandidate[] = [
      { networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 50, y: 0 } }, // 1/50 = 0.02
      { networkName: 'Curry', pointA: { x: 0, y: 0 }, pointB: { x: 100, y: 0 } }, // 1/100 = 0.01
    ]
    expect(deriveScale(segments)).toBeCloseTo(0.015, 10) // (0.02 + 0.01) / 2
  })

  it('throws NoCompleteRodError when no complete rod is given', () => {
    expect(() => deriveScale([])).toThrow(NoCompleteRodError)
  })
})
