// src/components/FreeformDrawTool.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { FreeformDrawTool } from './FreeformDrawTool'

describe('FreeformDrawTool', () => {
  it('renders without crashing when active', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FreeformDrawTool active missionOrigin={{ lat: 48.8566, lng: 2.3522 }} onComplete={vi.fn()} />
      </MapContainer>
    )
    // Renders no visible DOM of its own (it's a pure event-listener component,
    // like ClickHandler in MapView.tsx) — this just proves it mounts cleanly
    // inside a real Leaflet context without throwing.
    expect(container).toBeTruthy()
  })

  it('renders without crashing when inactive', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FreeformDrawTool active={false} missionOrigin={{ lat: 48.8566, lng: 2.3522 }} onComplete={vi.fn()} />
      </MapContainer>
    )
    expect(container).toBeTruthy()
  })
})
