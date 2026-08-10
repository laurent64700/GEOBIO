import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { ParcelsLayer } from './ParcelsLayer'
import type { StoredParcel } from '../domain/types'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const parcels: StoredParcel[] = [
  { id: '0012', section: 'AB', rings: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]] },
  { id: '0013', section: 'AB', rings: [[{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }]] },
]

describe('ParcelsLayer', () => {
  it('renders one polygon per parcel, as a thin non-filled reference outline', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <ParcelsLayer parcels={parcels} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    const shapes = container.querySelectorAll('path.leaflet-interactive')
    expect(shapes).toHaveLength(2)
    shapes.forEach((shape) => {
      expect(shape.getAttribute('stroke')).toBe('#555555')
      expect(shape.getAttribute('fill-opacity')).toBe('0')
    })
  })

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <ParcelsLayer parcels={parcels} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })

  it('renders nothing when there are no parcels', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <ParcelsLayer parcels={[]} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })
})
