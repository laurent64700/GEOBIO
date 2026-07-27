import { Fragment } from 'react'
import { CircleMarker, Polyline, Tooltip } from 'react-leaflet'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import type { FeltSegment } from '../domain/types'

export interface FeltSegmentsLayerProps {
  segments: FeltSegment[]
  colorForNetwork: (networkName: string) => string
  missionOrigin: LatLng
  visible: boolean
  /** Grid-recalibration mode: clicking a segment reports it, and already-picked ids render thicker/dashed. */
  onSegmentClick?: (segment: FeltSegment) => void
  selectedSegmentIds?: string[]
}

// Small end-cap marker, just big enough to anchor a permanent polarity
// tooltip — same CircleMarker + permanent Tooltip pattern as PhenomenaLayer's
// kind labels. Only rendered when a polarity is actually set: ArUco-detected
// segments (RodDetectionPanel) have null polarity (not sensed by that
// method), and showing an empty/placeholder label for those would be worse
// than showing nothing.
//
// `direction` is fixed opposite per end (A="top", B="bottom") rather than
// "center" — measured live 2026-07-23 at the ~1m/max-zoom scale this tool is
// actually used at: a segment spans as little as ~19 screen px while each
// centered label is ~34px tall, a confirmed ~285px² overlap making both
// polarities unreadable. Opposite perpendicular directions push the two
// labels to strictly opposite sides of the segment for ANY orientation
// (N/S, E/O, or a custom bearing) — for a N/S segment this pushes each
// label further along the segment's own axis, away from the other end; for
// an E/O segment it puts them on opposite sides of the line entirely.
function PolarityEndCap({
  point,
  color,
  polarity,
  direction,
}: {
  point: [number, number]
  color: string
  polarity: '+' | '-'
  direction: 'top' | 'bottom'
}) {
  // Direction alone left a residual ~7px vertical overlap band for a
  // near-vertical (N/S) 1m segment at max zoom (measured live 2026-07-23,
  // down from ~285px² but not zero) — Leaflet's default top/bottom offset is
  // a fixed distance from the anchor, not scaled by how close the two
  // anchors are. This explicit extra offset pushes each label further out
  // along its own direction until the two boxes clear each other even at
  // the smallest real segment span this tool ever produces.
  const offset: [number, number] = direction === 'top' ? [0, -6] : [0, 6]

  return (
    <CircleMarker center={point} radius={6} pathOptions={{ color, fillOpacity: 0.9 }}>
      <Tooltip permanent direction={direction} offset={offset} className="felt-segment-polarity-label">
        {polarity}
      </Tooltip>
    </CircleMarker>
  )
}

export function FeltSegmentsLayer({
  segments,
  colorForNetwork,
  missionOrigin,
  visible,
  onSegmentClick,
  selectedSegmentIds,
}: FeltSegmentsLayerProps) {
  if (!visible) return null

  return (
    <>
      {segments.map((segment) => {
        const a = localToLatLng(segment.pointA, missionOrigin)
        const b = localToLatLng(segment.pointB, missionOrigin)
        const color = colorForNetwork(segment.networkName)
        const selected = selectedSegmentIds?.includes(segment.id) ?? false
        return (
          <Fragment key={segment.id}>
            <Polyline
              positions={[[a.lat, a.lng], [b.lat, b.lng]]}
              pathOptions={{ color, weight: selected ? 6 : 3, dashArray: selected ? '2, 4' : undefined }}
              eventHandlers={onSegmentClick ? { click: () => onSegmentClick(segment) } : undefined}
            />
            {segment.polarityA !== null && (
              <PolarityEndCap point={[a.lat, a.lng]} color={color} polarity={segment.polarityA} direction="top" />
            )}
            {segment.polarityB !== null && (
              <PolarityEndCap point={[b.lat, b.lng]} color={color} polarity={segment.polarityB} direction="bottom" />
            )}
          </Fragment>
        )
      })}
    </>
  )
}
