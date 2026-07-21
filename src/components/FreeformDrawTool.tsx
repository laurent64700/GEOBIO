// src/components/FreeformDrawTool.tsx
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import { latLngToLocal, type LatLng } from '../geometry/localCoordinates'
import { simplifyByMinDistance } from '../geometry/polylineSimplify'
import type { Point } from '../domain/types'

// Minimum distance (meters, in mission-local coordinates) between consecutive
// kept points — see simplifyByMinDistance's own doc comment for why this
// bounds the point count for a slow/long gesture, not just a per-event cap.
const MIN_DISTANCE_M = 0.5

export interface FreeformDrawToolProps {
  /** Whether this tool should currently be capturing pointer input. */
  active: boolean
  missionOrigin: LatLng
  /** Called once, with the simplified point list, when the gesture ends. */
  onComplete: (points: Point[]) => void
}

/**
 * Continuous freehand capture — GEOBIO's own mechanism, not Geoman (see design
 * spec §2: leaflet-geoman-free has no freehand LINE mode in its free tier,
 * and Laurent explicitly rejected the click-to-place-vertex alternative as
 * "pas pratique"). Listens for BOTH mouse (mousedown/mousemove/mouseup, for
 * desktop testing) and touch (touchstart/touchmove/touchend/touchcancel, for
 * the real field-use finger/stylus input) events, bound directly on the map's
 * DOM container (mousedown/touch*) or document (mousemove/mouseup) via native
 * addEventListener — NOT via react-leaflet's useMapEvents, which only
 * forwards Leaflet's own map-level event names and does not merge touch
 * gestures into them (verified against Leaflet's source: a touchmove drag
 * does not synthesize continuous mousemove events the way a simple tap
 * synthesizes one mousedown/mouseup/click pair). Suspends map dragging for
 * the duration of the gesture (map.dragging.disable/.enable) so panning
 * doesn't fight with drawing, and prevents the browser's default touch
 * behavior (page scroll/pinch-zoom) during a touch capture.
 *
 * mousemove/mouseup are bound on `document`, not the map container: the
 * browser delivers `mouseup` to whichever element is under the cursor at
 * release time, not the element that received `mousedown`. A fast drag that
 * exits the map's bounds before the button is released would otherwise never
 * reach `onMouseUp`, leaving `map.dragging` disabled and the trace truncated.
 * Touch doesn't have this problem — a touch sequence implicitly target-locks
 * to the element that received `touchstart` — so container binding is fine
 * for touch.
 *
 * touchcancel (OS/browser-interrupted gesture: notification pull-down,
 * edge-swipe back gesture, an extra finger touching the screen) is handled
 * separately from touchend via cancelCapture, which resets state and
 * re-enables dragging WITHOUT calling onComplete — an interrupted gesture is
 * not a deliberately finished trace, so it shouldn't be saved as one. Without
 * this handler, an interruption would leave dragging disabled indefinitely.
 *
 * touchend/touchcancel additionally verify WHICH finger triggered the event
 * via TouchEvent.changedTouches (the touch(es) that specifically caused this
 * event — not .touches, which lists every still-active touch) against the
 * drawing touch's tracked `identifier`. Without this, a bracing second finger
 * (already correctly ignored on touchDOWN by the isDrawingRef guard in
 * onTouchStart) would incorrectly end the capture the moment IT lifts off,
 * even though the drawing finger never lifted — the mirror-image of the
 * re-entrant-touchstart bug, just on lift-off instead of touch-down.
 */
export function FreeformDrawTool({ active, missionOrigin, onComplete }: FreeformDrawToolProps) {
  const map = useMap()
  const isDrawingRef = useRef(false)
  const capturedPointsRef = useRef<Point[]>([])
  // The identifier of the Touch currently driving capture — null when no
  // touch-driven gesture is in progress (a mouse-driven gesture never sets
  // this). Set in onTouchStart, cleared in endCapture/cancelCapture.
  const drawingTouchIdRef = useRef<number | null>(null)

  useEffect(() => {
    const container = map.getContainer()

    function beginCapture(clientEvent: { clientX: number; clientY: number }) {
      isDrawingRef.current = true
      const latlng = map.mouseEventToLatLng(clientEvent as unknown as MouseEvent)
      capturedPointsRef.current = [latLngToLocal(latlng, missionOrigin)]
      map.dragging.disable()
    }

    function continueCapture(clientEvent: { clientX: number; clientY: number }) {
      if (!isDrawingRef.current) return
      const latlng = map.mouseEventToLatLng(clientEvent as unknown as MouseEvent)
      capturedPointsRef.current.push(latLngToLocal(latlng, missionOrigin))
    }

    function endCapture() {
      if (!isDrawingRef.current) return
      isDrawingRef.current = false
      drawingTouchIdRef.current = null
      map.dragging.enable()
      const simplified = simplifyByMinDistance(capturedPointsRef.current, MIN_DISTANCE_M)
      capturedPointsRef.current = []
      onComplete(simplified)
    }

    // Interrupted gesture (touchcancel): reset without saving anything.
    function cancelCapture() {
      if (!isDrawingRef.current) return
      isDrawingRef.current = false
      drawingTouchIdRef.current = null
      map.dragging.enable()
      capturedPointsRef.current = []
    }

    // Finds the Touch in `touchList` matching the tracked drawing touch's
    // identifier, or null if it isn't present (e.g. a different finger's
    // event, or no touch-driven gesture is in progress).
    function findDrawingTouch(touchList: { identifier: number; clientX: number; clientY: number }[]) {
      if (drawingTouchIdRef.current === null) return null
      for (let i = 0; i < touchList.length; i++) {
        if (touchList[i].identifier === drawingTouchIdRef.current) return touchList[i]
      }
      return null
    }

    function onMouseDown(e: MouseEvent) {
      // Left button only: a right/middle-click starting a capture would be
      // low-impact (mouse is desktop-testing-only in real field use) but
      // still worth excluding for a clean desktop testing experience.
      if (!active || e.button !== 0) return
      beginCapture(e)
    }
    function onMouseMove(e: MouseEvent) {
      continueCapture(e)
    }
    function onMouseUp() {
      endCapture()
    }

    function onTouchStart(e: TouchEvent) {
      // isDrawingRef guard: a second touch point landing mid-gesture (a
      // stray palm contact, or a second finger bracing the tablet — the
      // same real scenario touchcancel above is meant to handle) must NOT
      // re-trigger beginCapture. beginCapture unconditionally resets
      // capturedPointsRef to a fresh single-point array; without this guard
      // a second touchstart mid-drag silently discards every point captured
      // so far. Ignoring the extra touch and letting the first touch's
      // gesture keep capturing is the correct behavior here.
      if (!active || isDrawingRef.current || e.touches.length === 0) return
      const touch = e.touches[0]
      drawingTouchIdRef.current = touch.identifier
      beginCapture(touch)
    }
    function onTouchMove(e: TouchEvent) {
      if (!isDrawingRef.current) return
      // Prevent the page from scrolling/zooming while a trace is being drawn —
      // without this, the browser's default touch-scroll behavior fights with
      // the drag the moment the finger moves. This applies regardless of
      // which finger moved (a bracing second finger moving shouldn't
      // un-suppress scrolling either).
      e.preventDefault()
      const touch = findDrawingTouch(Array.from(e.touches))
      if (!touch) return // this move event isn't the drawing finger — ignore
      continueCapture(touch)
    }
    function onTouchEnd(e: TouchEvent) {
      const lifted = findDrawingTouch(Array.from(e.changedTouches))
      if (!lifted) return // some other finger lifted, not the drawing one — ignore
      endCapture()
    }
    function onTouchCancel(e: TouchEvent) {
      const cancelled = findDrawingTouch(Array.from(e.changedTouches))
      if (!cancelled) return
      cancelCapture()
    }

    // mousedown starts capture only when the gesture begins on the map itself.
    container.addEventListener('mousedown', onMouseDown)
    // mousemove/mouseup on document: see the "mousemove/mouseup are bound on
    // document" note above the component for why container binding drops
    // the release event when a fast drag exits the map's bounds.
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    // passive: false is required for touchmove's preventDefault() above to
    // actually take effect (browsers default touchmove listeners to passive).
    container.addEventListener('touchstart', onTouchStart)
    container.addEventListener('touchmove', onTouchMove, { passive: false })
    container.addEventListener('touchend', onTouchEnd)
    container.addEventListener('touchcancel', onTouchCancel)

    return () => {
      container.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
      container.removeEventListener('touchcancel', onTouchCancel)
      // Unconditionally unwind an in-progress gesture on teardown (component
      // unmounts mid-drag, or a future caller change churns active/missionOrigin
      // mid-gesture): without this, map.dragging would stay disabled forever
      // with no listener left alive to ever call .enable() again.
      // cancelCapture() itself no-ops if no gesture was in progress.
      cancelCapture()
    }
    // missionOrigin/onComplete are destructured to their stable primitive
    // fields (lat/lng) rather than depended on as objects: this file's
    // effect depends only on primitives for the same reason documented on
    // EditableNetworkLine.tsx's analogous effect — the caller may construct
    // missionOrigin as a fresh object literal on every render, and depending
    // on the object here would tear down and rebuild all 7 listeners on
    // every unrelated re-render, including mid-drag. onComplete must be a
    // useCallback-stabilized reference from the caller (see Task 12 Step 2)
    // for the same reason.
  }, [map, active, missionOrigin.lat, missionOrigin.lng, onComplete])

  return null
}
