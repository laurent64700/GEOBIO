// src/components/BuildingFootprintPicker.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { BuildingFootprintPicker } from './BuildingFootprintPicker'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const oneCandidate = [
  {
    ringsLatLng: [
      [
        { lat: 48.8566, lng: 2.3522 },
        { lat: 48.8567, lng: 2.3522 },
        { lat: 48.8567, lng: 2.3523 },
        { lat: 48.8566, lng: 2.3523 },
      ],
    ],
  },
]

describe('BuildingFootprintPicker', () => {
  it('renders one polygon per candidate', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <BuildingFootprintPicker
          candidates={oneCandidate}
          confirmedIndex={null}
          missionOrigin={missionOrigin}
          onChoose={vi.fn()}
        />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(1)
  })

  it('calls onChoose with the clicked candidate index', () => {
    const onChoose = vi.fn()
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <BuildingFootprintPicker
          candidates={oneCandidate}
          confirmedIndex={null}
          missionOrigin={missionOrigin}
          onChoose={onChoose}
        />
      </MapContainer>
    )
    const path = container.querySelector('path.leaflet-interactive')!
    path.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onChoose).toHaveBeenCalledWith(0)
  })
})
