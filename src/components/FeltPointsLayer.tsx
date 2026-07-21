import { CircleMarker } from 'react-leaflet'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import type { FeltPoint } from '../domain/types'

export interface FeltPointsLayerProps {
  points: FeltPoint[]
  colorForNetwork: (networkName: string) => string
  missionOrigin: LatLng
  visible: boolean
}

export function FeltPointsLayer({ points, colorForNetwork, missionOrigin, visible }: FeltPointsLayerProps) {
  if (!visible) return null

  return (
    <>
      {points.map((point) => {
        const latlng = localToLatLng(point, missionOrigin)
        return (
          <CircleMarker
            key={point.id}
            center={[latlng.lat, latlng.lng]}
            radius={5}
            pathOptions={{ color: colorForNetwork(point.networkName), fillOpacity: 0.9 }}
          />
        )
      })}
    </>
  )
}
