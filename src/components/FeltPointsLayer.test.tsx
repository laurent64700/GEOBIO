import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { FeltPointsLayer } from './FeltPointsLayer'
import type { FeltPoint } from '../domain/types'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const points: FeltPoint[] = [
  { id: 'fp1', planId: 'p1', networkName: 'Hartmann', x: 1, y: 1, createdAt: '2026-07-16T10:00:00Z' },
  { id: 'fp2', planId: 'p1', networkName: 'Curry', x: -1, y: -1, createdAt: '2026-07-16T10:01:00Z' },
]

describe('FeltPointsLayer', () => {
  it('renders one marker per point, colored by its network', () => {
    const colorForNetwork = (name: string) => (name === 'Hartmann' ? '#d32f2f' : '#f2c230')
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FeltPointsLayer points={points} colorForNetwork={colorForNetwork} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    const markers = container.querySelectorAll('path.leaflet-interactive')
    expect(markers).toHaveLength(2)
    expect(markers[0].getAttribute('stroke')).toBe('#d32f2f')
    expect(markers[1].getAttribute('stroke')).toBe('#f2c230')
  })

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FeltPointsLayer points={points} colorForNetwork={() => '#000'} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })
})
