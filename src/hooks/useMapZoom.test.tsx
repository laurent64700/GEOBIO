import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MapContainer, useMap } from 'react-leaflet'
import { useMapZoom } from './useMapZoom'

function ZoomProbe() {
  const zoom = useMapZoom()
  return <div data-testid="zoom-probe">{zoom}</div>
}

function ZoomSetter({ to }: { to: number }) {
  const map = useMap()
  return <button onClick={() => map.setZoom(to)}>set-zoom</button>
}

describe('useMapZoom', () => {
  it('returns the initial zoom, then updates when the map zooms', async () => {
    render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18} zoomAnimation={false}>
        <ZoomProbe />
        <ZoomSetter to={15} />
      </MapContainer>
    )

    expect(screen.getByTestId('zoom-probe')).toHaveTextContent('18')

    await act(async () => {
      screen.getByText('set-zoom').click()
    })

    expect(screen.getByTestId('zoom-probe')).toHaveTextContent('15')
  })
})
