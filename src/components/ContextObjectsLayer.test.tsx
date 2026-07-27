import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { ContextObjectsLayer } from './ContextObjectsLayer'
import type { ContextObject } from '../domain/types'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const objects: ContextObject[] = [
  { id: 'co1', planId: 'p1', kind: 'arbre-chene', x: 0, y: 0, createdAt: '2026-07-27T10:00:00Z' },
  { id: 'co2', planId: 'p1', kind: 'puits', x: 3, y: 4, createdAt: '2026-07-27T10:01:00Z' },
]

describe('ContextObjectsLayer', () => {
  it('renders one icon marker per context object, each with real SVG icon markup', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <ContextObjectsLayer objects={objects} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    const markers = container.querySelectorAll('.leaflet-marker-icon')
    expect(markers).toHaveLength(2)
    expect(markers[0].querySelector('svg')).not.toBeNull()
    expect(markers[1].querySelector('svg')).not.toBeNull()
  })

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <ContextObjectsLayer objects={objects} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(0)
  })

  it('renders nothing when there are no objects', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <ContextObjectsLayer objects={[]} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(0)
  })
})
