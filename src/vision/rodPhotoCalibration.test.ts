// src/vision/rodPhotoCalibration.test.ts
import { describe, it, expect } from 'vitest'
import { groupRodsInPixelSpace, deriveScale, NoCompleteRodError, deriveRotation, NoKnownNetworkFamilyError, buildAffineTransform } from './rodPhotoCalibration'
import type { RawMarkerDetection, FeltSegmentCandidate } from './arucoMapping'
import type { RodMarker } from '../domain/types'
import { applyAffineTransform } from '../geometry/affineTransform'
import { mapDetectionsToPoints, pairIntoSegmentsAndPoints } from './arucoMapping'

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

  it('throws NoCompleteRodError when a rod\'s 2 markers are implausibly close together in pixel space', () => {
    // A real rod's 2 markers are tens to hundreds of px apart (see the 50px/
    // 100px fixtures above) — 1px apart is a detection glitch (occlusion,
    // motion blur, bad crop), not a real rod. Dividing by a near-zero
    // distancePx would otherwise silently produce Infinity/huge scale.
    const segments: FeltSegmentCandidate[] = [
      { networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 1, y: 0 } },
    ]
    expect(() => deriveScale(segments)).toThrow(NoCompleteRodError)
  })

  it('throws NoCompleteRodError when a rod\'s 2 markers are detected at the exact same point (0px apart)', () => {
    const segments: FeltSegmentCandidate[] = [
      { networkName: 'Hartmann', pointA: { x: 10, y: 10 }, pointB: { x: 10, y: 10 } },
    ]
    expect(() => deriveScale(segments)).toThrow(NoCompleteRodError)
  })
})

describe('deriveRotation', () => {
  it('aligns the first known-family rod to the FIRST member of its family', () => {
    // Hartmann family is [0, 90] (networkBearings.ts). A rod measured at
    // 10° in pixel space (pointA→pointB) should produce θ = 0 − 10 = −10.
    const segments: FeltSegmentCandidate[] = [
      { networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 100, y: Math.tan((10 * Math.PI) / 180) * 100 } },
    ]
    expect(deriveRotation(segments)).toBeCloseTo(-10, 6)
  })

  it('uses the SECOND family member when useSecondFamilyMember is true (the "Inverser l\'orientation" case)', () => {
    // Same rod as above (measured at 10°), but this time aligned to
    // Hartmann's 2nd family member (90°): θ = 90 − 10 = 80.
    const segments: FeltSegmentCandidate[] = [
      { networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 100, y: Math.tan((10 * Math.PI) / 180) * 100 } },
    ]
    expect(deriveRotation(segments, true)).toBeCloseTo(80, 6)
  })

  it('skips a rod with no known network family and uses the next one that has one', () => {
    const segments: FeltSegmentCandidate[] = [
      { networkName: 'Autre', pointA: { x: 0, y: 0 }, pointB: { x: 100, y: 100 } }, // no known family
      { networkName: 'Curry', pointA: { x: 0, y: 0 }, pointB: { x: 100, y: 0 } }, // measured at 0°, family [45,135]
    ]
    // Curry's first member is 45°, measured at 0° → θ = 45 − 0 = 45.
    expect(deriveRotation(segments)).toBeCloseTo(45, 6)
  })

  it('throws NoKnownNetworkFamilyError when no detected rod has a known network family', () => {
    const segments: FeltSegmentCandidate[] = [
      { networkName: 'Autre', pointA: { x: 0, y: 0 }, pointB: { x: 100, y: 100 } },
    ]
    expect(() => deriveRotation(segments)).toThrow(NoKnownNetworkFamilyError)
  })
})

describe('buildAffineTransform', () => {
  it('maps the photo center exactly onto realCenter, regardless of scale/rotation', () => {
    const transform = buildAffineTransform(0.02, 37, { x: 12.5, y: -4.3 }, { x: 800, y: 600 })
    const mapped = applyAffineTransform({ x: 800, y: 600 }, transform)
    expect(mapped.x).toBeCloseTo(12.5, 9)
    expect(mapped.y).toBeCloseTo(-4.3, 9)
  })

  it('scales a 1-pixel offset from center by the given scale, in the rotated direction', () => {
    // No rotation (θ=0): a +1px offset in x should map to +scale in real x.
    const transform = buildAffineTransform(0.02, 0, { x: 0, y: 0 }, { x: 0, y: 0 })
    const mapped = applyAffineTransform({ x: 1, y: 0 }, transform)
    expect(mapped.x).toBeCloseTo(0.02, 9)
    expect(mapped.y).toBeCloseTo(0, 9)
  })
})

describe('end-to-end (synthetic)', () => {
  it('composes groupRodsInPixelSpace → deriveScale/deriveRotation → buildAffineTransform → mapDetectionsToPoints to recover known real positions', () => {
    // A single Hartmann rod, 50px apart in pixel space, running due "east"
    // in pixel space (0° measured angle) — Hartmann's family is [0, 90], so
    // this aligns with NO rotation needed (θ = 0 − 0 = 0).
    const detections: RawMarkerDetection[] = [
      { markerId: 101, corners: [{ x: 95, y: 95 }, { x: 105, y: 95 }, { x: 105, y: 105 }, { x: 95, y: 105 }] }, // centroid (100,100)
      { markerId: 102, corners: [{ x: 145, y: 95 }, { x: 155, y: 95 }, { x: 155, y: 105 }, { x: 145, y: 105 }] }, // centroid (150,100)
    ]
    const rodMarkers: RodMarker[] = [
      { markerId: 101, networkName: 'Hartmann', rodNumber: 1 },
      { markerId: 102, networkName: 'Hartmann', rodNumber: 1 },
    ]
    const photoCenter = { x: 100, y: 100 } // deliberately == marker 101's position
    const realCenter = { x: 5, y: 5 } // where Laurent clicked

    const pixelGroup = groupRodsInPixelSpace(detections, rodMarkers)
    const s = deriveScale(pixelGroup.segments) // 1 / 50 = 0.02
    const theta = deriveRotation(pixelGroup.segments) // 0
    const transform = buildAffineTransform(s, theta, realCenter, photoCenter)

    const { recognized } = mapDetectionsToPoints(detections, transform, rodMarkers)
    const { segments } = pairIntoSegmentsAndPoints(recognized)

    expect(segments).toHaveLength(1)
    // marker 101 IS the photo center → maps exactly to realCenter.
    expect(segments[0].pointA.x).toBeCloseTo(5, 9)
    expect(segments[0].pointA.y).toBeCloseTo(5, 9)
    // marker 102 is 50px east of center → 50 * 0.02 = 1m east of realCenter.
    expect(segments[0].pointB.x).toBeCloseTo(6, 9)
    expect(segments[0].pointB.y).toBeCloseTo(5, 9)
  })
})
