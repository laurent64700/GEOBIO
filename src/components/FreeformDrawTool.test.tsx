// src/components/FreeformDrawTool.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { FreeformDrawTool } from './FreeformDrawTool'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }

function renderTool(onComplete: (points: unknown) => void) {
  const { container } = render(
    <MapContainer center={[48.8566, 2.3522]} zoom={18}>
      <FreeformDrawTool active missionOrigin={missionOrigin} onComplete={onComplete} />
    </MapContainer>
  )
  const mapContainer = container.querySelector('.leaflet-container') as HTMLElement
  return { mapContainer }
}

// jsdom does not implement the `Touch`/`TouchEvent` constructors, so a real
// touch gesture is synthesized as a plain `Event` with `touches`/`changedTouches`
// arrays attached as plain properties. FreeformDrawTool's handlers only ever read
// `e.touches`, `e.changedTouches`, and call `e.preventDefault()` — all work
// identically on this synthesized event and on a real browser TouchEvent.
interface FakeTouch {
  clientX: number
  clientY: number
  identifier: number
}
function fireTouch(
  target: EventTarget,
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  touches: FakeTouch[],
  changedTouches: FakeTouch[] = touches
) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  ;(event as unknown as { touches: FakeTouch[]; changedTouches: FakeTouch[] }).touches = touches
  ;(event as unknown as { changedTouches: FakeTouch[] }).changedTouches = changedTouches
  target.dispatchEvent(event)
}

describe('FreeformDrawTool', () => {
  it('renders without crashing when active', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FreeformDrawTool active missionOrigin={missionOrigin} onComplete={vi.fn()} />
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
        <FreeformDrawTool active={false} missionOrigin={missionOrigin} onComplete={vi.fn()} />
      </MapContainer>
    )
    expect(container).toBeTruthy()
  })

  it('completes a mouse drag whose move/up events fire on document, not the map container', () => {
    // This is the whole point of the document-binding fix documented in
    // FreeformDrawTool.tsx: mousedown starts on the map container, but
    // mousemove/mouseup are dispatched on `document` here — exactly mimicking
    // a real drag where the cursor can leave the map's DOM bounds before the
    // button is released. If mousemove/mouseup were (incorrectly) bound to
    // the container only, this test would see onComplete never called.
    const onComplete = vi.fn()
    const { mapContainer } = renderTool(onComplete)

    mapContainer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100, button: 0 }))
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 110, clientY: 110 }))
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))

    expect(onComplete).toHaveBeenCalledTimes(1)
    const points = onComplete.mock.calls[0][0] as unknown[]
    expect(points.length).toBeGreaterThan(0)
  })

  it('resets on touchcancel without calling onComplete', () => {
    const onComplete = vi.fn()
    const { mapContainer } = renderTool(onComplete)

    fireTouch(mapContainer, 'touchstart', [{ clientX: 100, clientY: 100, identifier: 0 }])
    fireTouch(mapContainer, 'touchmove', [{ clientX: 110, clientY: 110, identifier: 0 }])
    fireTouch(mapContainer, 'touchcancel', [], [{ clientX: 110, clientY: 110, identifier: 0 }])

    expect(onComplete).not.toHaveBeenCalled()
  })

  it('ignores a second touchstart mid-gesture instead of discarding the trace captured so far', () => {
    // Regression test for the critical bug: a stray second finger (palm
    // contact, or a hand bracing the tablet) firing touchstart while a
    // gesture is already in progress must NOT reset capturedPointsRef via
    // beginCapture — it should be ignored, and the first touch's gesture
    // should keep capturing normally through to touchend.
    const onComplete = vi.fn()
    const { mapContainer } = renderTool(onComplete)

    fireTouch(mapContainer, 'touchstart', [{ clientX: 100, clientY: 100, identifier: 0 }])
    fireTouch(mapContainer, 'touchmove', [{ clientX: 110, clientY: 110, identifier: 0 }])
    // Second finger lands mid-gesture: touches now reports two contact points.
    fireTouch(mapContainer, 'touchstart', [
      { clientX: 111, clientY: 111, identifier: 0 },
      { clientX: 200, clientY: 200, identifier: 1 },
    ])
    fireTouch(mapContainer, 'touchend', [], [{ clientX: 111, clientY: 111, identifier: 0 }])

    expect(onComplete).toHaveBeenCalledTimes(1)
    const points = onComplete.mock.calls[0][0] as unknown[]
    // Truncated-by-the-bug behavior would report exactly 1 point (only the
    // single point captured by the re-entrant beginCapture). The fix must
    // preserve both points captured before the second touchstart.
    expect(points.length).toBeGreaterThanOrEqual(2)
  })

  it('ignores touchend from a bracing second finger, keeps capturing until the drawing finger lifts', () => {
    // Regression test, mirror image of "ignores a second touchstart mid-gesture":
    // a bracing second finger (identifier 1) touches down mid-gesture (already
    // correctly ignored by the isDrawingRef guard in onTouchStart) and then
    // lifts OFF before the drawing finger (identifier 0) does. The bracing
    // finger's own touchend must NOT end the capture — only the drawing
    // finger's touchend should.
    const onComplete = vi.fn()
    const { mapContainer } = renderTool(onComplete)

    fireTouch(mapContainer, 'touchstart', [{ clientX: 100, clientY: 100, identifier: 0 }])
    fireTouch(mapContainer, 'touchmove', [{ clientX: 110, clientY: 110, identifier: 0 }])
    // Bracing second finger touches down — already ignored by the existing
    // isDrawingRef guard (both touches now active).
    fireTouch(
      mapContainer,
      'touchstart',
      [{ clientX: 110, clientY: 110, identifier: 0 }, { clientX: 200, clientY: 200, identifier: 1 }]
    )
    // The BRACING finger (identifier 1) lifts off first. The drawing finger
    // (identifier 0) is still down, reported in `touches`; `changedTouches`
    // reports only the finger that just lifted (identifier 1).
    fireTouch(
      mapContainer,
      'touchend',
      [{ clientX: 110, clientY: 110, identifier: 0 }], // still-active touches
      [{ clientX: 200, clientY: 200, identifier: 1 }]  // changedTouches: the lifted one
    )

    // The capture must still be in progress — onComplete must NOT have fired yet.
    expect(onComplete).not.toHaveBeenCalled()

    // Now the drawing finger itself continues and lifts — THIS must end the capture.
    fireTouch(mapContainer, 'touchmove', [{ clientX: 120, clientY: 120, identifier: 0 }])
    fireTouch(
      mapContainer,
      'touchend',
      [],
      [{ clientX: 120, clientY: 120, identifier: 0 }]
    )

    expect(onComplete).toHaveBeenCalledTimes(1)
    const points = onComplete.mock.calls[0][0] as unknown[]
    expect(points.length).toBeGreaterThanOrEqual(2)
  })
})
