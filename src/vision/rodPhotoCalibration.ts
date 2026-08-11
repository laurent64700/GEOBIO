// src/vision/rodPhotoCalibration.ts
import { mapDetectionsToPoints, pairIntoSegmentsAndPoints, type RawMarkerDetection, type PairingResult } from './arucoMapping'
import type { AffineTransform, Point, RodMarker } from '../domain/types'
import type { FeltSegmentCandidate } from './arucoMapping'
import { allowedBearingsForNetwork } from '../domain/networkBearings'

// A no-op transform — applying it to a pixel coordinate returns that exact
// coordinate unchanged (see applyAffineTransform.ts: x' = a·x + b·y + e =
// 1·x + 0·y + 0 = x). Used to reuse mapDetectionsToPoints/
// pairIntoSegmentsAndPoints for grouping markers into rods IN PIXEL SPACE,
// before any real AffineTransform exists (see design spec §"Flux de
// données" for why this two-call approach is needed).
const IDENTITY_TRANSFORM: AffineTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

export function groupRodsInPixelSpace(
  detections: RawMarkerDetection[],
  rodMarkers: RodMarker[]
): PairingResult {
  const { recognized } = mapDetectionsToPoints(detections, IDENTITY_TRANSFORM, rodMarkers)
  return pairIntoSegmentsAndPoints(recognized)
}

// The fixed real-world distance between a rod's 2 ArUco markers — same
// convention as manual felt-segment placement (FELT_SEGMENT_HALF_LENGTH_M
// = 0.5 in usePlacementMode.ts, i.e. a 1m segment), confirmed with Laurent.
const ROD_MARKER_DISTANCE_M = 1

export class NoCompleteRodError extends Error {}

export function deriveScale(segments: FeltSegmentCandidate[]): number {
  if (segments.length === 0) {
    throw new NoCompleteRodError("Aucune tige complète détectée — impossible de calculer l'échelle.")
  }
  const estimates = segments.map((segment) => {
    const distancePx = Math.hypot(
      segment.pointB.x - segment.pointA.x,
      segment.pointB.y - segment.pointA.y
    )
    // Real units per pixel — NOT pixels per real unit. The transform this
    // feeds (buildAffineTransform, Task 4) does x' = a·x + ... with x in
    // pixels and x' in meters, so `s` must already be in m/px.
    return ROD_MARKER_DISTANCE_M / distancePx
  })
  return estimates.reduce((sum, v) => sum + v, 0) / estimates.length
}

export class NoKnownNetworkFamilyError extends Error {}

function pixelAngleDeg(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

// Deliberately simple — see design spec §"Limite connue, acceptée": the
// only 2 known angle families (0°/90° and 45°/135°) are both invariant
// under a 90° rotation, so no amount of cross-referencing additional
// rods/networks can resolve which of a family's 2 members is correct.
// Laurent accepted this residual ambiguity; `useSecondFamilyMember` is the
// escape hatch ("Inverser l'orientation", Chunk 2).
export function deriveRotation(
  segments: FeltSegmentCandidate[],
  useSecondFamilyMember = false
): number {
  for (const segment of segments) {
    const family = allowedBearingsForNetwork(segment.networkName)
    if (family === null) continue
    const measuredAngleDeg = pixelAngleDeg(segment.pointA, segment.pointB)
    const targetMember = family[useSecondFamilyMember ? 1 : 0]
    return targetMember - measuredAngleDeg
  }
  throw new NoKnownNetworkFamilyError(
    "Aucune tige de réseau reconnu détectée — impossible de calculer l'orientation."
  )
}
