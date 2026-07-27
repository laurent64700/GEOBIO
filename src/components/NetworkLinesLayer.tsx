import { Polyline } from 'react-leaflet'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import { widthForNetwork } from '../domain/networkWidths'
import { lineWeightForZoom } from '../geometry/lineWeightForZoom'
import { useMapZoom } from '../hooks/useMapZoom'
import type { GridLine, GridTemplate } from '../domain/types'

export interface NetworkLinesLayerProps {
  lines: GridLine[]
  templateSnapshot: Pick<GridTemplate, 'color' | 'name'>
  missionOrigin: LatLng
  visible: boolean
}

export function NetworkLinesLayer({ lines, templateSnapshot, missionOrigin, visible }: NetworkLinesLayerProps) {
  const zoom = useMapZoom()
  if (!visible) return null

  const realWidthM = widthForNetwork(templateSnapshot.name)

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
            weight: lineWeightForZoom(realWidthM, missionOrigin.lat, zoom, line.reinforced),
          }}
        />
      ))}
    </>
  )
}
