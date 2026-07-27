import { Polygon } from 'react-leaflet'
import type { CadastralParcel } from '../data/cadastreService'

const SELECTED_STYLE = { color: '#2d6a4f', weight: 3, fillOpacity: 0.35 }
const UNSELECTED_STYLE = { color: '#888888', weight: 2, fillOpacity: 0.08 }

export interface ParcelPickerProps {
  parcels: CadastralParcel[]
  selectedIds: Set<string>
  onToggle: (parcelId: string) => void
}

// A cadastral parcel with a MultiPolygon geometry arrives here as several
// CadastralParcel entries sharing the same id (see cadastreService.ts) — each
// part is rendered and toggled independently, but selection is keyed by id so
// all parts of the same parcel highlight together.
export function ParcelPicker({ parcels, selectedIds, onToggle }: ParcelPickerProps) {
  return (
    <>
      {parcels.map((parcel, index) => {
        const selected = selectedIds.has(parcel.id)
        return (
          <Polygon
            key={`${parcel.id}-${index}`}
            positions={parcel.ringsLatLng[0].map((latlng) => [latlng.lat, latlng.lng] as [number, number])}
            pathOptions={selected ? SELECTED_STYLE : UNSELECTED_STYLE}
            eventHandlers={{ click: () => onToggle(parcel.id) }}
          />
        )
      })}
    </>
  )
}
