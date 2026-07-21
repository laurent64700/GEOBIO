import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { PhenomenaLayer } from './PhenomenaLayer'
import type { Phenomenon } from '../domain/types'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const phenomena: Phenomenon[] = [
  { id: 'ph1', planId: 'p1', kind: 'spire-vortex', x: 0, y: 0, createdAt: '2026-07-21T10:00:00Z' },
  { id: 'ph2', planId: 'p1', kind: 'cheminee-2', x: 3, y: 4, createdAt: '2026-07-21T10:01:00Z' },
]

describe('PhenomenaLayer', () => {
  it('renders one marker per phenomenon', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <PhenomenaLayer phenomena={phenomena} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(2)
  })

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <PhenomenaLayer phenomena={phenomena} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })

  it('renders nothing when there are no phenomena', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <PhenomenaLayer phenomena={[]} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })
})
