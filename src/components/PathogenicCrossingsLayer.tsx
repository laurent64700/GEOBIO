import { CircleMarker } from 'react-leaflet'
import type { PathogenicCrossing } from '../geometry/pathogenicCrossings'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'

export interface PathogenicCrossingsLayerProps {
  crossings: PathogenicCrossing[]
  missionOrigin: LatLng
  visible: boolean
}

// Orange/red, distinct from the Bagua layer's purple and from any seeded
// network color (red/yellow/blue/purple/green — see 0005_seed_confirmed_networks.sql).
const CROSSING_COLOR = '#e65100'

export function PathogenicCrossingsLayer({ crossings, missionOrigin, visible }: PathogenicCrossingsLayerProps) {
  if (!visible) return null

  return (
    <>
      {crossings.map((crossing, index) => {
        const latlng = localToLatLng(crossing.point, missionOrigin)
        return (
          <CircleMarker
            key={`${crossing.hartmannLineId}-${crossing.curryLineId}-${index}`}
            center={[latlng.lat, latlng.lng]}
            radius={6}
            pathOptions={{ color: CROSSING_COLOR, fillOpacity: 0.9 }}
          />
        )
      })}
    </>
  )
}
