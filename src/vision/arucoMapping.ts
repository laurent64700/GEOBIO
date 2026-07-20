// src/vision/arucoMapping.ts
import { applyAffineTransform } from '../geometry/affineTransform'
import type { AffineTransform, Point, RodMarker } from '../domain/types'

export interface RawMarkerDetection {
  markerId: number
  /** The marker's 4 corners in pixel coordinates, in whatever order the detector returns them. */
  corners: [Point, Point, Point, Point]
}

export interface RecognizedPoint {
  markerId: number
  rodNumber: number
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
  const markerById = new Map(rodMarkers.map((m) => [m.markerId, m]))
  const recognized: RecognizedPoint[] = []

  for (const detection of detections) {
    const marker = markerById.get(detection.markerId)
    if (marker === undefined) continue

    const real = applyAffineTransform(centroid(detection.corners), calibration)
    recognized.push({
      markerId: marker.markerId,
      rodNumber: marker.rodNumber,
      networkName: marker.networkName,
      x: real.x,
      y: real.y,
    })
  }

  return { recognized, totalDetected: detections.length, totalRecognized: recognized.length }
}

export interface FeltSegmentCandidate {
  networkName: string
  pointA: Point
  pointB: Point
}

export interface PairingResult {
  segments: FeltSegmentCandidate[]
  points: RecognizedPoint[]
}

/**
 * Groups recognized points by (networkName, rodNumber) — the two markers of
 * the same physical rod, per spec §3.2. A duplicate detection of the same
 * markerId within one frame is deduped first (keep first occurrence), so a
 * group can only exceed 2 members if rod_marker itself has more than 2
 * distinct marker IDs for one (networkName, rodNumber) pair — not expected
 * given how rod_marker is seeded, but handled defensively: only the 2 lowest
 * marker IDs in a group become a segment, extras are silently dropped.
 */
export function pairIntoSegmentsAndPoints(recognized: RecognizedPoint[]): PairingResult {
  const seenMarkerIds = new Set<number>()
  const deduped: RecognizedPoint[] = []
  for (const point of recognized) {
    if (seenMarkerIds.has(point.markerId)) continue
    seenMarkerIds.add(point.markerId)
    deduped.push(point)
  }

  const groups = new Map<string, RecognizedPoint[]>()
  for (const point of deduped) {
    const key = `${point.networkName}::${point.rodNumber}`
    const group = groups.get(key)
    if (group) group.push(point)
    else groups.set(key, [point])
  }

  const segments: FeltSegmentCandidate[] = []
  const points: RecognizedPoint[] = []
  for (const group of groups.values()) {
    if (group.length >= 2) {
      const [a, b] = [...group].sort((x, y) => x.markerId - y.markerId)
      segments.push({ networkName: a.networkName, pointA: { x: a.x, y: a.y }, pointB: { x: b.x, y: b.y } })
    } else {
      points.push(group[0])
    }
  }

  return { segments, points }
}
