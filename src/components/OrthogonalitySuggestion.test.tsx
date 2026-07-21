import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { OrthogonalitySuggestion } from './OrthogonalitySuggestion'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }

describe('OrthogonalitySuggestion', () => {
  it('renders a gray dashed preview of the straightened line', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <OrthogonalitySuggestion
          linePoints={[{ x: 0, y: -10 }, { x: 0.8, y: 10 }]}
          family="axis-a"
          template={{ angleTrueNorthDeg: 0 }}
          missionOrigin={missionOrigin}
        />
      </MapContainer>
    )
    const path = container.querySelector('path.leaflet-interactive')
    expect(path?.getAttribute('stroke')).toBe('#888888')
    expect(path?.getAttribute('stroke-dasharray')).toBe('2, 6')
    expect(path?.getAttribute('stroke-width')).toBe('2')
  })
})
