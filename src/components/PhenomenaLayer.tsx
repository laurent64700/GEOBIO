import { CircleMarker, Tooltip } from 'react-leaflet'
import type { Phenomenon } from '../domain/types'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'

export interface PhenomenaLayerProps {
  phenomena: Phenomenon[]
  missionOrigin: LatLng
  visible: boolean
}

// Placeholder text codes standing in for real icons (spec §7 — real icons from
// Laurent's legend sheet are out of scope for this pass). Swapping these for
// real icon assets later only touches this map, not the data model or callers.
const KIND_LABELS: Record<Phenomenon['kind'], string> = {
  'cheminee-1': 'Ch1',
  'cheminee-2': 'Ch2',
  'cheminee-3': 'Ch3',
  'cheminee-4': 'Ch4',
  'spire-vortex': 'Vx',
  'point-cosmique': 'Cos',
  'carre-magique': 'CM',
  'tube-magique': 'TM',
}

const PHENOMENON_COLOR = '#6a1b9a'

export function PhenomenaLayer({ phenomena, missionOrigin, visible }: PhenomenaLayerProps) {
  if (!visible) return null

  return (
    <>
      {phenomena.map((phenomenon) => {
        const latlng = localToLatLng(phenomenon, missionOrigin)
        return (
          <CircleMarker
            key={phenomenon.id}
            center={[latlng.lat, latlng.lng]}
            radius={8}
            pathOptions={{ color: PHENOMENON_COLOR, fillOpacity: 0.85 }}
          >
            <Tooltip permanent direction="center" className="phenomenon-label">
              {KIND_LABELS[phenomenon.kind]}
            </Tooltip>
          </CircleMarker>
        )
      })}
    </>
  )
}
