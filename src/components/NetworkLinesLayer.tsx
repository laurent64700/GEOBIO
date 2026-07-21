import { Polyline } from 'react-leaflet'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import type { GridLine, GridTemplate } from '../domain/types'

export interface NetworkLinesLayerProps {
  lines: GridLine[]
  templateSnapshot: Pick<GridTemplate, 'color'>
  missionOrigin: LatLng
  visible: boolean
}

export function NetworkLinesLayer({ lines, templateSnapshot, missionOrigin, visible }: NetworkLinesLayerProps) {
  if (!visible) return null

  return (
    <>
      {lines.map((line) => (
        <Polyline
          key={line.id}
          positions={line.adjustedPoints.map((p) => {
            const latlng = localToLatLng(p, missionOrigin)
            return [latlng.lat, latlng.lng] as [number, number]
          })}
          pathOptions={{
            color: templateSnapshot.color,
            dashArray: line.polarity === '-' ? '6, 4' : undefined,
            weight: line.reinforced ? 4 : 2,
          }}
        />
      ))}
    </>
  )
}
