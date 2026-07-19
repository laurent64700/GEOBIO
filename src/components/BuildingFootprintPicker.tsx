// src/components/BuildingFootprintPicker.tsx
import { Polygon } from 'react-leaflet'
import type { BuildingFootprint } from '../data/buildingFootprintService'
import type { LatLng } from '../geometry/localCoordinates'

export interface BuildingFootprintPickerProps {
  candidates: BuildingFootprint[]
  confirmedIndex: number | null
  missionOrigin: LatLng
  onChoose: (index: number) => void
}

// Purely presentational — SiteMapView owns fetching, error state, and the
// confirm/"Changer de bâtiment"/no-result UI (rendered via OverlayPanel).
// See this task's note above for why data-fetching does not live here.
export function BuildingFootprintPicker({ candidates, confirmedIndex, onChoose }: BuildingFootprintPickerProps) {
  return (
    <>
      {candidates.map((candidate, index) => (
        <Polygon
          key={index}
          positions={candidate.ringsLatLng[0].map((latlng) => [latlng.lat, latlng.lng] as [number, number])}
          pathOptions={{ color: confirmedIndex === index ? '#2d6a4f' : '#888888', weight: 2 }}
          eventHandlers={{ click: () => onChoose(index) }}
        />
      ))}
    </>
  )
}
