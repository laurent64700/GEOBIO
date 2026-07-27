import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { CalibratedPlanOverlay } from './CalibratedPlanOverlay'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

describe('CalibratedPlanOverlay', () => {
  beforeEach(() => {
    // jsdom's Image doesn't actually load image bytes — stub it so `new Image()`
    // fires onload on the next tick with a known natural size, matching the
    // pattern already used in RodDetectionPanel.test.tsx.
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        naturalWidth = 800
        naturalHeight = 600
        set src(_: string) {
          setTimeout(() => this.onload?.(), 0)
        }
      }
    )
  })

  afterEach(() => vi.unstubAllGlobals())

  it('adds an <img> to the map overlay pane once the image has loaded, sized to its natural dimensions', async () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <CalibratedPlanOverlay imageUrl="https://x/plan.jpg" calibration={identity} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )

    await waitFor(() => {
      const img = container.querySelector('.leaflet-overlay-pane img')
      expect(img).not.toBeNull()
    })
    const img = container.querySelector('.leaflet-overlay-pane img') as HTMLImageElement
    expect(img.src).toBe('https://x/plan.jpg')
    expect(img.style.width).toBe('800px')
    expect(img.style.height).toBe('600px')
    expect(img.style.transform).toMatch(/^matrix\(/)
  })

  it('renders nothing when visible is false', async () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <CalibratedPlanOverlay imageUrl="https://x/plan.jpg" calibration={identity} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    // Give the (stubbed) image load a chance to fire, so this isn't just "too early".
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(container.querySelector('.leaflet-overlay-pane img')).toBeNull()
  })

  it('removes the <img> from the pane on unmount', async () => {
    const { container, unmount } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <CalibratedPlanOverlay imageUrl="https://x/plan.jpg" calibration={identity} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    await waitFor(() => expect(container.querySelector('.leaflet-overlay-pane img')).not.toBeNull())

    unmount()

    expect(document.querySelector('.leaflet-overlay-pane img')).toBeNull()
  })
})
