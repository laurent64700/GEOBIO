import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MapView } from './MapView'

describe('MapView', () => {
  it('renders a Leaflet map container', () => {
    render(<MapView center={[48.8566, 2.3522]} />)
    expect(document.querySelector('.leaflet-container')).not.toBeNull()
  })

  it('renders the IGN attribution', () => {
    render(<MapView center={[48.8566, 2.3522]} />)
    expect(screen.getByText(/IGN-F\/Géoportail/)).toBeInTheDocument()
  })

  it('calls onMapClick with lat/lng when the map is clicked', () => {
    const onMapClick = vi.fn()
    render(<MapView center={[48.8566, 2.3522]} onMapClick={onMapClick} />)
    const container = document.querySelector('.leaflet-container') as HTMLElement
    // jsdom gives the container a zero-size layout box by default, so pass
    // explicit coordinates rather than relying on fireEvent's clientX/clientY
    // defaults (both 0) — this keeps the resulting lat/lng meaningful instead
    // of a degenerate case that would pass even if the handler were broken.
    fireEvent.click(container, { clientX: 50, clientY: 50 })
    expect(onMapClick).toHaveBeenCalled()
    const [{ lat, lng }] = onMapClick.mock.calls[0]
    expect(Number.isFinite(lat)).toBe(true)
    expect(Number.isFinite(lng)).toBe(true)
  })

  it('renders children inside the map container', () => {
    render(
      <MapView center={[48.8566, 2.3522]}>
        <div data-testid="child-layer" />
      </MapView>
    )
    expect(screen.getByTestId('child-layer')).toBeInTheDocument()
  })
})
