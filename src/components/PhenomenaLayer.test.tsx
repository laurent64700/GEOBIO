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
  it('renders one icon marker per phenomenon', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <PhenomenaLayer phenomena={phenomena} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(2)
  })

  it('gives the cheminee-2 marker its "2" branch-count badge, and the vortex marker none', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <PhenomenaLayer phenomena={phenomena} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    const markers = container.querySelectorAll('.leaflet-marker-icon')
    expect(markers[0].querySelector('.geobio-icon-badge')).toBeNull() // spire-vortex
    expect(markers[1].querySelector('.geobio-icon-badge')?.textContent).toBe('2') // cheminee-2
  })

  it('renders real SVG icon markup for each marker, not a placeholder text code', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <PhenomenaLayer phenomena={[phenomena[0]]} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelector('.leaflet-marker-icon svg')).not.toBeNull()
  })

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <PhenomenaLayer phenomena={phenomena} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(0)
  })

  it('renders nothing when there are no phenomena', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <PhenomenaLayer phenomena={[]} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(0)
  })
})
