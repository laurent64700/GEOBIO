import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { MapView } from './MapView'

describe('MapView', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  it('fits the view to the given bounds once on mount when fitBounds is provided', () => {
    const fitBoundsSpy = vi.spyOn(L.Map.prototype, 'fitBounds')
    render(
      <MapView
        center={[48.8566, 2.3522]}
        fitBounds={[
          [48.8560, 2.3510],
          [48.8570, 2.3530],
        ]}
      />
    )
    expect(fitBoundsSpy).toHaveBeenCalledTimes(1)
  })

  it('does not call fitBounds when the prop is not provided', () => {
    const fitBoundsSpy = vi.spyOn(L.Map.prototype, 'fitBounds')
    render(<MapView center={[48.8566, 2.3522]} />)
    expect(fitBoundsSpy).not.toHaveBeenCalled()
  })

  it('does not render Leaflet\'s native zoom +/- control', () => {
    render(<MapView center={[48.8566, 2.3522]} />)
    expect(document.querySelector('.leaflet-control-zoom')).toBeNull()
  })

  it('sets minZoom to the zoom level fitBounds itself would use, when fitBounds is provided', () => {
    // Whatever getBoundsZoom itself resolves to, at the container's real
    // size — not asserting a specific number (depends on jsdom's zero-size
    // layout box), just that setMinZoom receives EXACTLY that value, proving
    // the floor isn't a hardcoded constant but genuinely derived from the
    // bounds passed in. getBoundsZoom is called twice in practice — once by
    // Leaflet's own internal fitBounds() implementation, once explicitly by
    // MapView for setMinZoom — so this checks the LAST call's result, not
    // an exact call count that would couple the test to Leaflet's internals.
    const boundsZoomSpy = vi.spyOn(L.Map.prototype, 'getBoundsZoom')
    const setMinZoomSpy = vi.spyOn(L.Map.prototype, 'setMinZoom')
    render(
      <MapView
        center={[48.8566, 2.3522]}
        fitBounds={[
          [48.8560, 2.3510],
          [48.8570, 2.3530],
        ]}
      />
    )
    expect(setMinZoomSpy).toHaveBeenCalledTimes(1)
    expect(boundsZoomSpy.mock.results.length).toBeGreaterThanOrEqual(1)
    const lastResult = boundsZoomSpy.mock.results[boundsZoomSpy.mock.results.length - 1].value
    expect(setMinZoomSpy.mock.calls[0][0]).toBe(lastResult)
  })

  it('does not set minZoom when fitBounds is not provided — a resumed mission with no tracked parcel bounds keeps the default (unbounded) zoom-out range', () => {
    const setMinZoomSpy = vi.spyOn(L.Map.prototype, 'setMinZoom')
    render(<MapView center={[48.8566, 2.3522]} />)
    expect(setMinZoomSpy).not.toHaveBeenCalled()
  })

  it('shows a plain backdrop (no imagery) once zoomed past the native tile resolution, and hides it again zooming back out', async () => {
    function ZoomButtons() {
      const map = useMap()
      return (
        <>
          <button onClick={() => map.setZoom(20)}>zoom-in-past-native</button>
          <button onClick={() => map.setZoom(18)}>zoom-back-to-native</button>
        </>
      )
    }
    render(
      <MapView center={[48.8566, 2.3522]} zoom={18}>
        <ZoomButtons />
      </MapView>
    )
    expect(screen.queryByTestId('high-zoom-backdrop')).not.toBeInTheDocument()

    await act(async () => {
      screen.getByText('zoom-in-past-native').click()
    })
    expect(screen.getByTestId('high-zoom-backdrop')).toBeInTheDocument()

    await act(async () => {
      screen.getByText('zoom-back-to-native').click()
    })
    expect(screen.queryByTestId('high-zoom-backdrop')).not.toBeInTheDocument()
  })
})
