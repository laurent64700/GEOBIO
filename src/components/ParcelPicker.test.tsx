import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { fireEvent } from '@testing-library/react'
import { ParcelPicker } from './ParcelPicker'
import type { CadastralParcel } from '../data/cadastreService'

const parcels: CadastralParcel[] = [
  { id: 'A123', section: 'A', ringsLatLng: [[{ lat: 48.8560, lng: 2.3510 }, { lat: 48.8562, lng: 2.3512 }, { lat: 48.8561, lng: 2.3514 }]] },
  { id: 'A124', section: 'A', ringsLatLng: [[{ lat: 48.8563, lng: 2.3520 }, { lat: 48.8565, lng: 2.3522 }, { lat: 48.8564, lng: 2.3524 }]] },
]

describe('ParcelPicker', () => {
  it('renders one polygon per parcel', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <ParcelPicker parcels={parcels} selectedIds={new Set()} onToggle={vi.fn()} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(2)
  })

  it('calls onToggle with the parcel id when clicked', () => {
    const onToggle = vi.fn()
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <ParcelPicker parcels={parcels} selectedIds={new Set()} onToggle={onToggle} />
      </MapContainer>
    )
    const paths = container.querySelectorAll('path.leaflet-interactive')
    fireEvent.click(paths[0])
    expect(onToggle).toHaveBeenCalledWith('A123')
  })

  it('styles a selected parcel differently from an unselected one', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <ParcelPicker parcels={parcels} selectedIds={new Set(['A123'])} onToggle={vi.fn()} />
      </MapContainer>
    )
    const paths = container.querySelectorAll('path.leaflet-interactive')
    expect(paths[0].getAttribute('stroke')).not.toBe(paths[1].getAttribute('stroke'))
  })

  it('treats two entries sharing the same id (a multi-polygon parcel split into parts) as one selectable unit', () => {
    const splitParcel: CadastralParcel[] = [
      { id: 'B1', section: 'B', ringsLatLng: [[{ lat: 48.8560, lng: 2.3510 }, { lat: 48.8562, lng: 2.3512 }, { lat: 48.8561, lng: 2.3514 }]] },
      { id: 'B1', section: 'B', ringsLatLng: [[{ lat: 48.8570, lng: 2.3530 }, { lat: 48.8572, lng: 2.3532 }, { lat: 48.8571, lng: 2.3534 }]] },
    ]
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <ParcelPicker parcels={splitParcel} selectedIds={new Set(['B1'])} onToggle={vi.fn()} />
      </MapContainer>
    )
    const paths = container.querySelectorAll('path.leaflet-interactive')
    // Both parts share the same selected styling since they're the same parcel id.
    expect(paths[0].getAttribute('stroke')).toBe(paths[1].getAttribute('stroke'))
  })
})
