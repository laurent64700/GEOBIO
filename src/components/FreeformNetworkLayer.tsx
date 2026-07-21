import { Polyline } from 'react-leaflet'
import type { FreeformNetwork } from '../domain/types'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import { NON_GRID_NETWORK_COLORS } from '../domain/networkColors'

export interface FreeformNetworkLayerProps {
  networks: FreeformNetwork[]
  missionOrigin: LatLng
  visible: boolean
}

function colorForKind(kind: FreeformNetwork['kind']): string {
  return kind === 'eau' ? NON_GRID_NETWORK_COLORS.Eau : NON_GRID_NETWORK_COLORS.Failles
}

export function FreeformNetworkLayer({ networks, missionOrigin, visible }: FreeformNetworkLayerProps) {
  if (!visible) return null

  return (
    <>
      {networks.map((network) => (
        <Polyline
          key={network.id}
          positions={network.points.map((p) => {
            const latlng = localToLatLng(p, missionOrigin)
            return [latlng.lat, latlng.lng] as [number, number]
          })}
          pathOptions={{ color: colorForKind(network.kind), weight: 3 }}
        />
      ))}
    </>
  )
}
