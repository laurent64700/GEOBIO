// src/vision/arucoMapping.ts
import { applyAffineTransform } from '../geometry/affineTransform'
import type { AffineTransform, Point, RodMarker } from '../domain/types'

export interface RawMarkerDetection {
  markerId: number
  /** The marker's 4 corners in pixel coordinates, in whatever order the detector returns them. */
  corners: [Point, Point, Point, Point]
}

export interface RecognizedPoint {
  networkName: string
  x: number
  y: number
}

export interface MappingResult {
  recognized: RecognizedPoint[]
  totalDetected: number
  totalRecognized: number
}

function centroid(corners: [Point, Point, Point, Point]): Point {
  return {
    x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
    y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
  }
}

/**
 * Maps raw marker detections to real-world points tagged by network, per
 * spec §5/§6: unrecognized marker IDs (not in `rodMarkers`) are silently
 * skipped for point creation (the caller surfaces the count difference to
 * Laurent — see `RodDetectionPanel`, Task 7), never thrown as an error.
 */
export function mapDetectionsToPoints(
  detections: RawMarkerDetection[],
  calibration: AffineTransform,
  rodMarkers: RodMarker[]
): MappingResult {
  const networkByMarkerId = new Map(rodMarkers.map((m) => [m.markerId, m.networkName]))
  const recognized: RecognizedPoint[] = []

  for (const detection of detections) {
    const networkName = networkByMarkerId.get(detection.markerId)
    if (networkName === undefined) continue

    const real = applyAffineTransform(centroid(detection.corners), calibration)
    recognized.push({ networkName, x: real.x, y: real.y })
  }

  return { recognized, totalDetected: detections.length, totalRecognized: recognized.length }
}
