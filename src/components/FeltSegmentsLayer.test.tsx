import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { FeltSegmentsLayer } from './FeltSegmentsLayer'
import type { FeltSegment } from '../domain/types'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const segments: FeltSegment[] = [
  { id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 }, polarityA: '+', polarityB: '-', createdAt: '2026-07-20T10:00:00Z' },
  { id: 'fs2', planId: 'p1', networkName: 'Curry', pointA: { x: -1, y: -1 }, pointB: { x: 1, y: 1 }, polarityA: null, polarityB: null, createdAt: '2026-07-20T10:01:00Z' },
]

describe('FeltSegmentsLayer', () => {
  it('renders one polyline per segment, colored by its network', () => {
    const colorForNetwork = (name: string) => (name === 'Hartmann' ? '#d32f2f' : '#f2c230')
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FeltSegmentsLayer segments={segments} colorForNetwork={colorForNetwork} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    const lines = container.querySelectorAll('path.leaflet-interactive')
    expect(lines).toHaveLength(2)
    expect(lines[0].getAttribute('stroke')).toBe('#d32f2f')
    expect(lines[1].getAttribute('stroke')).toBe('#f2c230')
  })

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FeltSegmentsLayer segments={segments} colorForNetwork={() => '#000'} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })

  it('renders nothing when there are no segments', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FeltSegmentsLayer segments={[]} colorForNetwork={() => '#000'} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })
})
