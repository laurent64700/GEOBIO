import { Polyline } from 'react-leaflet'
import { computeGuideLineEndpoints } from '../geometry/guideLine'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import type { Point } from '../domain/types'

export interface GuideLineLayerProps {
  anchor: Point | null
  bearingDeg: number | null
  missionOrigin: LatLng
}

export function GuideLineLayer({ anchor, bearingDeg, missionOrigin }: GuideLineLayerProps) {
  if (anchor === null || bearingDeg === null) return null

  return (
    <Polyline
      positions={computeGuideLineEndpoints(anchor, bearingDeg).map((p) => {
        const latlng = localToLatLng(p, missionOrigin)
        return [latlng.lat, latlng.lng] as [number, number]
      })}
      pathOptions={{ color: '#888888', dashArray: '4, 6', weight: 1 }}
    />
  )
}
