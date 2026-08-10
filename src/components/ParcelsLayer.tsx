// src/components/ParcelsLayer.tsx
import { Polygon } from 'react-leaflet'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import type { StoredParcel } from '../domain/types'

export interface ParcelsLayerProps {
  parcels: StoredParcel[]
  missionOrigin: LatLng
  visible: boolean
}

// A thin, non-interactive orientation reference — not a data layer to click
// or select. fillOpacity 0 keeps the imagery underneath fully visible; the
// dashed grey outline reads as a boundary line without competing visually
// with the colored network grid/felt segments (field testing 08/2026:
// Laurent needs these purely to keep his bearings on the map, not as
// another thing to interact with).
const PARCEL_STYLE = { color: '#555555', weight: 1, fillOpacity: 0, dashArray: '4, 3' }

export function ParcelsLayer({ parcels, missionOrigin, visible }: ParcelsLayerProps) {
  if (!visible) return null

  return (
    <>
      {parcels.map((parcel, index) => (
        <Polygon
          key={`${parcel.id}-${index}`}
          positions={parcel.rings.map((ring) =>
            ring.map((point) => {
              const latlng = localToLatLng(point, missionOrigin)
              return [latlng.lat, latlng.lng] as [number, number]
            })
          )}
          pathOptions={PARCEL_STYLE}
        />
      ))}
    </>
  )
}
