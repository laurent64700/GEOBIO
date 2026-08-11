// src/vision/rodPhotoCalibration.ts
import { mapDetectionsToPoints, pairIntoSegmentsAndPoints, type RawMarkerDetection, type PairingResult } from './arucoMapping'
import type { AffineTransform, RodMarker } from '../domain/types'

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
