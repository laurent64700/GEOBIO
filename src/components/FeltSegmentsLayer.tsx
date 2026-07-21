import { Polyline } from 'react-leaflet'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import type { FeltSegment } from '../domain/types'

export interface FeltSegmentsLayerProps {
  segments: FeltSegment[]
  colorForNetwork: (networkName: string) => string
  missionOrigin: LatLng
  visible: boolean
}

export function FeltSegmentsLayer({ segments, colorForNetwork, missionOrigin, visible }: FeltSegmentsLayerProps) {
  if (!visible) return null

  return (
    <>
      {segments.map((segment) => {
        const a = localToLatLng(segment.pointA, missionOrigin)
        const b = localToLatLng(segment.pointB, missionOrigin)
        return (
          <Polyline
            key={segment.id}
            positions={[[a.lat, a.lng], [b.lat, b.lng]]}
            pathOptions={{ color: colorForNetwork(segment.networkName), weight: 3 }}
          />
        )
      })}
    </>
  )
}
