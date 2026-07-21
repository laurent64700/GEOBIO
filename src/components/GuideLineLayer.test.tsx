import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { GuideLineLayer } from './GuideLineLayer'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }

describe('GuideLineLayer', () => {
  it('renders a gray dashed line through the anchor when anchor and bearing are set', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <GuideLineLayer anchor={{ x: 0, y: 0 }} bearingDeg={0} missionOrigin={missionOrigin} />
      </MapContainer>
    )
    const path = container.querySelector('path.leaflet-interactive')
    expect(path?.getAttribute('stroke')).toBe('#888888')
    expect(path?.getAttribute('stroke-dasharray')).toBe('4, 6')
  })

  it('renders nothing when anchor is null', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <GuideLineLayer anchor={null} bearingDeg={0} missionOrigin={missionOrigin} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })

  it('renders nothing when bearingDeg is null', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <GuideLineLayer anchor={{ x: 0, y: 0 }} bearingDeg={null} missionOrigin={missionOrigin} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })
})
