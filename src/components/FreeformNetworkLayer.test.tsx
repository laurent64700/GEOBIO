import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { FreeformNetworkLayer } from './FreeformNetworkLayer'
import type { FreeformNetwork } from '../domain/types'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const networks: FreeformNetwork[] = [
  { id: 'fn1', planId: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], currentBearingDeg: null, depthM: null, flowRate: null, createdAt: '2026-07-21T10:00:00Z' },
  { id: 'fn2', planId: 'p1', kind: 'faille', points: [{ x: -1, y: -1 }, { x: 2, y: 2 }], currentBearingDeg: null, depthM: null, flowRate: null, createdAt: '2026-07-21T10:01:00Z' },
]

describe('FreeformNetworkLayer', () => {
  it('renders one polyline per network, colored by kind', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FreeformNetworkLayer networks={networks} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    const lines = container.querySelectorAll('path.leaflet-interactive')
    expect(lines).toHaveLength(2)
    expect(lines[0].getAttribute('stroke')).toBe('#00acc1')
    expect(lines[1].getAttribute('stroke')).toBe('#795548')
  })

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FreeformNetworkLayer networks={networks} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })

  it('renders nothing when there are no networks', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FreeformNetworkLayer networks={[]} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })
})
