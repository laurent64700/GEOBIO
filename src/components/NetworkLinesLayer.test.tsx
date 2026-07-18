import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { NetworkLinesLayer } from './NetworkLinesLayer'
import type { GridLine } from '../domain/types'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }

const lines: GridLine[] = [
  {
    id: 'gl1', gridInstanceId: 'gi1', family: 'axis-a', polarity: '+', reinforced: true,
    theoreticalPoints: [{ x: 0, y: -10 }, { x: 0, y: 10 }],
    adjustedPoints: [{ x: 0, y: -10 }, { x: 0, y: 10 }],
  },
  {
    id: 'gl2', gridInstanceId: 'gi1', family: 'axis-a', polarity: '-', reinforced: false,
    theoreticalPoints: [{ x: 2.5, y: -10 }, { x: 2.5, y: 10 }],
    adjustedPoints: [{ x: 2.5, y: -10 }, { x: 2.5, y: 10 }],
  },
]

describe('NetworkLinesLayer', () => {
  it('renders one polyline per line, styled by polarity and reinforced state', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <NetworkLinesLayer lines={lines} templateSnapshot={{ color: '#d32f2f' }} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    const paths = container.querySelectorAll('path.leaflet-interactive')
    expect(paths).toHaveLength(2)
    // gl1: polarity '+' (solid, no dashArray), reinforced (thicker stroke)
    expect(paths[0].getAttribute('stroke')).toBe('#d32f2f')
    expect(paths[0].getAttribute('stroke-width')).toBe('4')
    expect(paths[0].hasAttribute('stroke-dasharray')).toBe(false)
    // gl2: polarity '-' (dashed), not reinforced (thinner stroke)
    expect(paths[1].getAttribute('stroke-width')).toBe('2')
    expect(paths[1].getAttribute('stroke-dasharray')).toBe('6, 4')
  })

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <NetworkLinesLayer lines={lines} templateSnapshot={{ color: '#d32f2f' }} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })
})
