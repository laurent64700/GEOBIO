# Freeform/Phenomena Follow-Up Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if
> subagents available) or superpowers:executing-plans to implement this plan. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 real, disclosed bugs found during code review of the freeform-and-phenomena
plan (now merged to `master`), then do a pure behavior-preserving refactor extracting
`SiteMapView.tsx`'s placement-mode logic into its own hook now that the logic it owns is
correct.

**Architecture:** Two independent bug fixes first (Chunk 1 — `FreeformDrawTool.tsx`'s
touch-identifier tracking, and a `src/vision/` dev-server crash), then two interdependent
`SiteMapView.tsx` fixes (Chunk 2 — a unified `startPlacementMode` guard that fixes two
separate disclosed bugs at once, plus a trace-preservation fix), then the extraction
(Chunk 3), done LAST and only after Chunk 2's fixes land — extracting first and fixing
after would mean fixing the same logic twice, once in `SiteMapView.tsx` and again in the
new hook file.

**Tech Stack:** Same as the rest of GEOBIO — Vite, React, TypeScript, react-leaflet,
Vitest + Testing Library. No new dependencies.

**Background — where these 5 bugs came from:** all found during code review of
`docs/superpowers/plans/2026-07-21-freeform-and-phenomena-plan.md`'s execution (now on
`master` at commit `30bf231`), each already investigated and root-caused:

1. **`FreeformDrawTool.tsx` touch-identifier gap:** `onTouchEnd`/`onTouchCancel` take no
   event parameter and unconditionally end/cancel the gesture on ANY `touchend`/
   `touchcancel`, regardless of which finger lifted. A prior fix in this same file already
   handles a stray SECOND finger touching DOWN mid-gesture (ignored, doesn't reset
   capture) — this is the mirror-image gap: a stray second (bracing) finger lifting OFF
   mid-gesture incorrectly ends the capture even though the drawing finger never lifted.
2. **`src/vision/arucoDetector.ts` breaks `npm run dev` entirely.** Root-caused this
   session (see Task 2 below for the full verified mechanism) — a pre-existing,
   unrelated-to-freeform bug that happens to block manual browser verification of
   anything in the app, not just ArUco features.
3. **Two `SiteMapView.tsx` mode-start entry points don't replicate a pattern the
   guide-line tool already has.** `handleGridOriginRequested`/the guide-line "Placer ici"
   button both correctly detect "was a grid-origin request pending?" and bump
   `gridCreationKey` so `GridCreationPanel` doesn't get stranded — `handleSelectPhenomenonKind`
   and `handleStartFreeformTrace` don't, so starting either of those modes while a
   grid-origin request is pending leaves `GridCreationPanel` stuck showing "Cliquez
   l'origine sur la carte" forever (only recoverable via a full page reload).
4. **No mode-start entry point guards against interrupting an in-progress freeform
   drag.** `FreeformDrawTool` is the only mode with continuous, stateful capture
   (`isDrawingRef`/`capturedPointsRef` spanning mousedown→mousemove×N→mouseup or the touch
   equivalent) — if a `PhenomenonPicker` button or the guide-line/grid-origin "Placer ici"
   button is clicked while a drag is mid-gesture (plausible two-handed tablet use: a
   stylus drawing while the other hand taps an overlay button), `placementMode.kind` flips
   away from `'freeform'`, `FreeformDrawTool.active` goes `false`, its cleanup fires
   `cancelCapture()`, and every point captured so far is silently discarded.
5. **`handleSubmitFreeformMetadata`'s `finally` block clears `pendingFreeformTrace` even
   on a failed save.** A transient network error while saving a freehand-drawn trace
   currently loses the trace entirely — the only way to try again is to redraw from
   scratch (after reloading the page to clear the page-blocking `error` state, since
   nothing ever calls `setError(null)`).

Items 3 and 4 are fixed TOGETHER in Task 3 via one small shared helper
(`startPlacementMode`), which is both the natural generalization and what a reviewer
explicitly recommended — a helper that's always used to start a new mode, rather than
one-off checks copy-pasted at each of the 4 "start X" call sites.

**Worktree:** Already created — `D:\LAURENT PC\GEOBIO\.worktrees\freeform-followups` on
branch `feature/freeform-followups`, based on `master` at `30bf231`. Baseline verified
clean: 267/267 tests, `tsc -b --noEmit` clean.

---

## Chunk 1: Independent bug fixes (`FreeformDrawTool.tsx`, `src/vision/`)

**Why these two first:** neither touches `SiteMapView.tsx` — no risk of conflicting with
Chunk 2, and both are small, well-isolated, already-verified fixes.

### Task 1: `FreeformDrawTool` — track the drawing touch's identifier

**Files:**
- Modify: `src/components/FreeformDrawTool.tsx`
- Modify: `src/components/FreeformDrawTool.test.tsx`

**Current bug (confirmed by reading the file):** `onTouchEnd`/`onTouchCancel` (around
lines 126-131) take no event parameter:
```typescript
function onTouchEnd() {
  endCapture()
}
function onTouchCancel() {
  cancelCapture()
}
```
Both unconditionally end/cancel on ANY `touchend`/`touchcancel` event fired on the
container, regardless of which physical finger triggered it. `onTouchStart` already
guards against a second finger touching DOWN mid-gesture (`isDrawingRef.current` check,
comment explains the "bracing finger" scenario) — but if that same bracing finger lifts
OFF before the drawing finger does, its `touchend` event fires `endCapture()` immediately,
ending the trace early even though the drawing finger is still down and the user isn't
done.

**Fix:** track the drawing touch's `identifier` (a stable per-gesture id every real
`Touch` object carries, assigned by the browser) in a ref set when the gesture begins.
Use `TouchEvent.changedTouches` (the touches that specifically triggered THIS event — not
`.touches`, which lists all CURRENTLY active touches) to determine which physical finger
just lifted/cancelled, and only act if it matches the tracked drawing-touch identifier.

- [ ] **Step 1: Update the `fireTouch` test helper to carry `identifier` and support `changedTouches`**

Read `src/components/FreeformDrawTool.test.tsx` in full first — the 5 existing tests
(`renders without crashing when active`, `renders without crashing when inactive`,
`completes a mouse drag...`, `resets on
touchcancel...`, `ignores a second touchstart mid-gesture...`) all still need to pass
after this change; the 2 touch-based ones need `identifier` added to their synthesized
touch objects (any concrete number works, just be consistent per gesture — e.g. `0` for
the first/drawing finger, `1` for a second/bracing finger).

```typescript
// src/components/FreeformDrawTool.test.tsx — replace the existing fireTouch helper
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
```

Update the 2 existing touch-based tests to add `identifier` to every touch object (e.g.
`{ clientX: 100, clientY: 100, identifier: 0 }`), and to the second-touchstart test's
extra touch, use a different identifier (e.g. `identifier: 1`) for the second/bracing
finger. Their final `touchend`/`touchcancel` calls (currently `fireTouch(mapContainer,
'touchend', [])` / `fireTouch(mapContainer, 'touchcancel', [])`) need an explicit
`changedTouches` argument now, since `touches` is empty and would otherwise default
`changedTouches` to `[]` too — for these two EXISTING tests, the drawing finger (id `0`)
is the one lifting, so pass `changedTouches: [{ clientX: ..., clientY: ..., identifier: 0
}]` explicitly (exact clientX/clientY values don't matter for a lift event, since
`endCapture`/`cancelCapture` don't read coordinates — reuse the last known position for
clarity). Run the full `FreeformDrawTool.test.tsx` file after this step and confirm all 4
existing tests still pass — this step is a test-infrastructure change only, not yet the
fix, so nothing about the component's behavior should change yet.

- [ ] **Step 2: Write a failing regression test for the bracing-finger-lifts-first scenario**

```typescript
// append to src/components/FreeformDrawTool.test.tsx
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/components/FreeformDrawTool.test.tsx`
Expected: FAIL — the new test's first `expect(onComplete).not.toHaveBeenCalled()`
assertion fails, since the current (buggy) `onTouchEnd` ends the capture on the bracing
finger's `touchend` regardless of which finger it was.

- [ ] **Step 4: Implement identifier tracking**

```typescript
// src/components/FreeformDrawTool.tsx — full replacement of the component body
// (imports and MIN_DISTANCE_M constant above this are unchanged)

/**
 * ... (keep the existing doc comment on FreeformDrawTool, ADD this paragraph
 * to it, after the existing touchcancel paragraph):
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
      if (!active || isDrawingRef.current || e.touches.length === 0) return
      const touch = e.touches[0]
      drawingTouchIdRef.current = touch.identifier
      beginCapture(touch)
    }
    function onTouchMove(e: TouchEvent) {
      if (!isDrawingRef.current) return
      // Prevent page scroll/zoom for the whole gesture, regardless of which
      // finger moved (a bracing second finger moving shouldn't un-suppress
      // scrolling either).
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

    container.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
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
      cancelCapture()
    }
  }, [map, active, missionOrigin.lat, missionOrigin.lng, onComplete])

  return null
}
```

**Note on `Array.from(e.touches)`/`Array.from(e.changedTouches)`:** a real `TouchList` is
not a real JS array (no `.find`/`.map`), so `findDrawingTouch` takes a plain array and
callers convert via `Array.from`. In the jsdom-synthesized test events, `touches`/
`changedTouches` are already plain arrays (per the `fireTouch` helper above) —
`Array.from` on an already-array value is a harmless no-op, so this works identically in
both the test and real-browser environments.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/components/FreeformDrawTool.test.tsx`
Expected: PASS (6 tests — the 5 original + the identifier-tracking test, plus confirm none
of the other existing tests regressed from the `fireTouch` signature change in Step 1).

- [ ] **Step 6: Mutation-check the fix**

Temporarily revert `onTouchEnd`/`onTouchCancel` back to taking no parameter and
unconditionally calling `endCapture()`/`cancelCapture()` (i.e., undo just Step 4's
identifier-checking logic, keep everything else), rerun
`FreeformDrawTool.test.tsx`, and confirm the new Step 2 test fails with the bracing
finger's premature `touchend` calling `onComplete` too early. Then restore the real fix
and confirm `git diff` on `FreeformDrawTool.tsx` matches exactly what Step 4 specifies (no
leftover mutation).

- [ ] **Step 7: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/components/FreeformDrawTool.tsx src/components/FreeformDrawTool.test.tsx
git commit -m "FreeformDrawTool: track the drawing touch's identifier so a bracing finger's lift-off doesn't end the trace early"
```

### Task 2: Fix `js-aruco2` breaking the dev server

**Files:**
- Create: `src/vision/jsAruco2Shim.ts` + `src/vision/jsAruco2Shim.test.ts`
- Modify: `src/vision/arucoDetector.ts`
- Modify: `src/vision/arucoDetector.test.ts`

**Root cause, verified this session (not guessed) by fetching the actual dev-server-served
module content over HTTP and inspecting it byte-for-byte:**

`js-aruco2` v2.0.0's `src/aruco.js` (and `src/cv.js`) are written for the old
"concatenate multiple `<script>` tags sharing `window` as `this`" browser pattern — each
file does `this.CV = CV` / `this.AR = AR` at its own top level (not `module.exports =` or
`exports.X =`, which is what CJS/ESM interop tooling actually looks for), with a
`require('./cv')` fallback only reachable in a real Node/CJS context.

Vite's dependency pre-bundler (this project uses the Rolldown-based optimizer — confirmed
via the `rolldown-runtime-*.js` chunk import at the top of the pre-bundled output)
rewrites this file's top-level `this` to `void 0` (technically correct: a real ES
module's top-level `this` really is `undefined`) — but `aruco.js` line 33 is `var CV =
this.CV || require('./cv').CV`, so `(void 0).CV` throws a `TypeError` and the module's
top-level code never finishes executing, so `this.AR = AR` (later in the file) never runs
either. The result: Vite's pre-bundled chunk for `js-aruco2` ends up with ZERO exports —
confirmed by fetching `http://localhost:.../node_modules/.vite/deps/js-aruco2.js?v=...`
directly and finding no `export` statement anywhere in the 2096-line output. Since
`arucoDetector.ts`'s `import { AR } from 'js-aruco2'` gets rewritten by Vite into a
default-style CJS-interop import (`import __vite__cjsImport0_jsAruco2 from
".../js-aruco2.js?v=..."; const AR = __vite__cjsImport0_jsAruco2["AR"]` — confirmed by
fetching the dev-server-transformed `arucoDetector.ts`), the missing default export is
exactly what produces the observed crash: `SyntaxError: The requested module
'.../js-aruco2.js' does not provide an export named 'default'`.

(Excluding `js-aruco2` from `optimizeDeps` was tried and rejected as a fix: Vite then
serves the RAW, untransformed file, where `this` stays literal `this` — but the browser
has no `require()` global, so `require('./cv')` throws `ReferenceError: require is not
defined` instead. Neither of Vite's two code paths for handling this dependency works;
the fix has to live in our own code.)

**Fix, verified end-to-end this session (ran the exact shim code in isolation and got a
real working `AR.Detector` with a real `detect` method):** don't let Vite's dependency
tooling touch `js-aruco2` at all. Import both files' raw source as plain text (Vite's
`?raw` import suffix, which returns the file's content as a string and does NO module
transformation on it whatsoever), then execute that text ourselves via `new Function(...)`
with an explicit shared context object passed as `this` — reproducing exactly the
"multiple `<script>` tags sharing one global object" execution model these files were
actually written for, without needing to touch `window` or inject real `<script>` tags.

- [ ] **Step 1: Write a failing test for the shim**

```typescript
// src/vision/jsAruco2Shim.test.ts
import { describe, it, expect } from 'vitest'
import { AR } from './jsAruco2Shim'

describe('jsAruco2Shim', () => {
  it('loads a working AR.Detector from js-aruco2, matching the real library API', () => {
    expect(AR).toBeDefined()
    expect(typeof AR.Detector).toBe('function')
    const detector = new AR.Detector({ dictionaryName: 'ARUCO' })
    expect(typeof detector.detect).toBe('function')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/vision/jsAruco2Shim.test.ts`
Expected: FAIL — `Cannot find module './jsAruco2Shim'`

- [ ] **Step 3: Implement the shim**

```typescript
// src/vision/jsAruco2Shim.ts
//
// js-aruco2 (v2.0.0) ships two files (cv.js, aruco.js) written for the old
// "concatenate multiple <script> tags sharing window as `this`" browser
// pattern: each does `this.CV = CV` / `this.AR = AR` at its own top level —
// not `module.exports =`/`exports.X =`, which is what CJS/ESM interop
// tooling actually recognizes. Vite's dependency pre-bundler (this project
// uses the Rolldown-based optimizer) rewrites this file's top-level `this`
// to `void 0` (technically correct ESM semantics), so `this.CV` throws a
// TypeError partway through evaluating aruco.js and `this.AR = AR` never
// runs — verified by fetching the dev-server's pre-bundled chunk directly
// and finding it has ZERO exports. Excluding js-aruco2 from optimizeDeps was
// tried too: Vite then serves the file un-transformed, where `this` stays
// literal `this`, but the browser has no `require()` global, so
// `require('./cv')` (aruco.js's own fallback path) throws instead. Neither
// of Vite's two code paths for handling a CJS dependency can execute this
// particular file correctly.
//
// Fix: import both files' raw source as plain TEXT (Vite's `?raw` suffix —
// no module transformation at all is applied to a `?raw` import) and
// execute that text ourselves via `new Function(...)`, explicitly supplying
// a shared object as `this` — reproducing exactly the "two <script> tags
// sharing one global" execution model these files were actually written
// for. `new Function` here runs a fixed, versioned, already-audited
// dependency's own source (imported at build time via `?raw`, never
// user-controlled input fetched at runtime), which is what makes this a
// contained, legitimate use of dynamic code execution rather than an
// injection risk.
import cvSource from 'js-aruco2/src/cv.js?raw'
import arucoSource from 'js-aruco2/src/aruco.js?raw'

// Typed to match both real consuming call sites, not left as `unknown[]`:
// arucoDetector.ts's `detectMarkers` reads `.id`/`.corners` off each detected
// marker, and arucoDetector.test.ts constructs `new AR.Dictionary('ARUCO')`
// directly and reads `.codeList`/`.markSize` off it. `unknown[]`/an empty
// `AR` shape would compile today only because the OLD `@ts-expect-error`
// import made `AR` implicitly `any` — once `AR` has a real type, the
// existing `.map((marker: { id: number; corners: Point[] }) => ...)` call in
// arucoDetector.ts needs its actual shape reflected here, or `tsc` fails.
interface JsAruco2Namespace {
  Detector: new (options: { dictionaryName: string }) => {
    detect: (image: { width: number; height: number; data: Uint8ClampedArray }) => {
      id: number
      corners: { x: number; y: number }[]
      hammingDistance: number
    }[]
  }
  Dictionary: new (dictionaryName: string) => {
    codeList: string[]
    markSize: number
  }
}

const sharedContext: { CV?: unknown; AR?: JsAruco2Namespace } = {}
new Function(cvSource).call(sharedContext)
new Function(arucoSource).call(sharedContext)

if (!sharedContext.AR) {
  throw new Error("Impossible de charger js-aruco2 : l'export AR est introuvable après exécution du shim.")
}

export const AR = sharedContext.AR
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/vision/jsAruco2Shim.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Update `arucoDetector.ts` to import from the shim instead of `js-aruco2` directly**

```typescript
// src/vision/arucoDetector.ts — replace the top import
// (delete the old `@ts-expect-error` + `import { AR } from 'js-aruco2'` block)
import { AR } from './jsAruco2Shim'
import type { RawMarkerDetection } from './arucoMapping'
import type { Point } from '../domain/types'
```

Also update `src/vision/arucoDetector.test.ts`'s own `import { AR } from 'js-aruco2'` to
`import { AR } from './jsAruco2Shim'` — this file directly constructs `new
AR.Dictionary('ARUCO')` and reads `.codeList`/`.markSize` off it (to synthesize a
genuine test marker image), which is why `JsAruco2Namespace` above declares `Dictionary`
as well as `Detector`, not just `Detector` alone.

- [ ] **Step 6: Run the full vision test suite and type-check**

Run: `node_modules/.bin/vitest.cmd run src/vision/`
Expected: PASS, same test count as before this task (this is a swap of import source, not
a behavior change — `detectMarkers`'s own tests should be completely unaffected).

Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: clean.

- [ ] **Step 7: Manually verify the dev server actually starts and renders**

Run: `npm run dev`, open the app in a browser, confirm the page renders (not blank) and
the browser console has no `SyntaxError` referencing `js-aruco2`. This is the actual bug
being fixed — confirm it's gone, not just that tests pass (vitest runs through Node's
CJS-aware module loader, which never hit this bug in the first place; only the real
Vite dev server did).

- [ ] **Step 8: Commit**

```bash
git add src/vision/jsAruco2Shim.ts src/vision/jsAruco2Shim.test.ts src/vision/arucoDetector.ts src/vision/arucoDetector.test.ts
git commit -m "Fix js-aruco2 breaking npm run dev: shim its legacy this.X= export pattern via a raw-text new Function load"
```

---

## Chunk 2: `SiteMapView.tsx` mode-interference fixes

**Depends on:** nothing from Chunk 1 (different files entirely) — can be done before,
after, or interleaved with Chunk 1, but must land BEFORE Chunk 3 (the extraction), since
Chunk 3 moves this exact logic into a new file and should move it in its already-correct
form.

**Re-read `src/components/SiteMapView.tsx` and `.test.tsx` in full before starting** —
this plan's line/text references were captured at commit `30bf231`; verify against the
current file before editing.

### Task 3: Add a `startPlacementMode` guard, fixing both the `GridCreationPanel`-stranding bug and the freeform-drag-interruption bug

**Files:**
- Modify: `src/components/SiteMapView.tsx`
- Modify: `src/components/SiteMapView.test.tsx`

**The two bugs this fixes, both about mode-start entry points not being uniformly safe:**

*Bug A (GridCreationPanel stranded):* `handleGridOriginRequested` and the guide-line
"Placer ici" button both correctly do "was grid-origin pending? then bump
`gridCreationKey`" (see the existing `wasAwaitingGridOrigin` local + comment on the
"Placer ici" `onClick`). `handleSelectPhenomenonKind` and `handleStartFreeformTrace`
don't — so starting either of THOSE modes while grid-origin is pending leaves
`GridCreationPanel` showing "Cliquez l'origine sur la carte" forever, since nothing ever
bumps `gridCreationKey` on that path.

*Bug B (freeform drag silently discarded):* none of the 4 mode-start entry points check
whether a freeform drag might currently be in progress before switching
`placementMode` away from `'freeform'`. `handleStartFreeformTrace`'s own buttons are
`disabled={placementMode !== null}` so this is accidentally safe FOR NOW at that one call
site — but `PhenomenonPicker`'s kind buttons and the guide-line/grid-origin controls have
no such guard, and even the freeform buttons' guard is incidental, not structural.

**Fix:** one shared helper used by all 4 "start a mode" call sites.

**A side effect of the Bug B fix, caught in plan review, that needs its own small fix:**
today, once freeform mode is armed (a "Tracer l'eau"/"Tracer une faille" button clicked)
but BEFORE any drag has actually started, the ONLY way to back out of it is to click a
DIFFERENT mode-start control (a phenomenon kind, "Placer ici", etc.) — the freeform
buttons themselves are `disabled={placementMode !== null}`, so they can't be clicked
again to self-cancel. Once `startPlacementMode`'s freeform guard blocks ALL of those other
controls from switching away from `'freeform'` (to fix Bug B), that incidental escape
hatch disappears too — leaving no way to cancel an armed-but-not-yet-dragging freeform
mode short of drawing some trace and then clicking "Annuler" on the metadata form, or
reloading the page. Step 3 below fixes this by giving the two freeform buttons their own
`PhenomenonPicker`-style toggle: clicking the CURRENTLY-ARMED kind's own button again
cancels it directly (a deliberate, explicit self-cancel — safe to allow even if a drag
might be in progress, unlike switching to a completely different, unrelated mode, which
`startPlacementMode`'s guard still correctly blocks).

- [ ] **Step 1: Write failing tests for both bugs and the self-cancel fix**

```tsx
// append to src/components/SiteMapView.test.tsx

it('selecting a phenomenon kind while a grid-origin request is pending does not strand GridCreationPanel', async () => {
  vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
  vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
  vi.mocked(createGridForPlan).mockResolvedValue({ instance: mockHartmannInstance, lines: [] })

  render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
  await screen.findByTestId('map-view')

  // Start grid creation and pick a template — pendingOrigin is null, so
  // GridCreationPanel shows "Cliquez l'origine sur la carte" and stays that
  // way until the map is clicked OR gridCreationKey is bumped.
  fireEvent.click(screen.getByRole('button', { name: /ajouter une grille/i }))
  fireEvent.click(await screen.findByText('simulate-select-hartmann'))
  expect(screen.getByText(/cliquez l'origine sur la carte/i)).toBeInTheDocument()

  // Instead of clicking the map, select a phenomenon kind — this must cancel
  // the pending grid-origin request AND force GridCreationPanel back to
  // collapsed, exactly like the guide-line "Placer ici" button already does.
  fireEvent.click(screen.getByRole('button', { name: /spire de vortex/i }))

  expect(screen.queryByText(/cliquez l'origine/i)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /ajouter une grille/i })).toBeInTheDocument()
})

it('does not let starting another mode silently discard an in-progress freeform drag', async () => {
  vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
  vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

  render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
  await screen.findByTestId('map-view')

  // Start a freeform trace — the mocked FreeformDrawTool renders
  // "simulate-freeform-complete" only while active, proving a drag could be
  // in progress right now.
  fireEvent.click(await screen.findByRole('button', { name: /tracer l'eau/i }))
  expect(screen.getByText('simulate-freeform-complete')).toBeInTheDocument()

  // Attempt to start phenomenon-placement mode WITHOUT finishing the drag —
  // this must be refused (the freeform tool must stay active), not silently
  // switch away and discard the in-progress capture.
  fireEvent.click(screen.getByRole('button', { name: /spire de vortex/i }))

  expect(screen.getByText('simulate-freeform-complete')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /spire de vortex/i })).toHaveAttribute('aria-pressed', 'false')
})

it('cancels an armed (not-yet-dragging) freeform mode by clicking its own button again', async () => {
  vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
  vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

  render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
  await screen.findByTestId('map-view')

  // Arm freeform mode — FreeformDrawTool goes active, no drag has started yet.
  fireEvent.click(await screen.findByRole('button', { name: /tracer l'eau/i }))
  expect(screen.getByText('simulate-freeform-complete')).toBeInTheDocument()

  // Clicking the SAME button again must cancel it directly — this is the
  // only way to back out of an armed-but-not-dragging freeform mode, since
  // every other mode-start control now correctly refuses to interrupt it
  // (see the previous test).
  fireEvent.click(screen.getByRole('button', { name: /tracer l'eau/i }))
  expect(screen.queryByText('simulate-freeform-complete')).not.toBeInTheDocument()

  // And starting a DIFFERENT mode now works normally, proving placementMode
  // is genuinely back to null, not stuck.
  fireEvent.click(screen.getByRole('button', { name: /spire de vortex/i }))
  expect(screen.getByRole('button', { name: /spire de vortex/i })).toHaveAttribute('aria-pressed', 'true')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/components/SiteMapView.test.tsx`
Expected: FAIL — all three new tests fail (the first because `GridCreationPanel` stays
stuck; the second because `handleSelectPhenomenonKind` currently switches `placementMode`
away from `'freeform'` unconditionally; the third because the freeform buttons are
currently `disabled={placementMode !== null}` with no self-toggle, so the second click on
"Tracer l'eau" does nothing).

- [ ] **Step 3: Add the `startPlacementMode` helper and use it everywhere a mode starts**

```typescript
// src/components/SiteMapView.tsx
// Add this function near the other placementMode-related handlers (right
// after handleGridOriginRequested is a reasonable spot).
//
// Single entry point for "start mode X", used by every "start a mode"
// control (grid-origin request, guide-line "Placer ici", phenomenon-kind
// select, freeform trace start). Two things this guarantees that used to be
// one-off checks copy-pasted per call site (or, for 2 of the 4 call sites,
// missing entirely):
//   1. If a freeform drag could currently be in progress (placementMode is
//      'freeform' AND pendingFreeformTrace is null — i.e. FreeformDrawTool's
//      `active` prop is currently true), refuse the switch entirely. The
//      user must finish the gesture (mouseup/touchend, which naturally ends
//      the drag) before another mode can start — switching away mid-drag
//      would otherwise silently discard every point captured so far.
//   2. If a grid-origin request was pending, bump gridCreationKey so
//      GridCreationPanel doesn't keep showing a stale "cliquez l'origine"
//      prompt for a click that will now go to the newly-started mode
//      instead.
function startPlacementMode(mode: PlacementMode) {
  if (placementMode?.kind === 'freeform' && pendingFreeformTrace === null) {
    return // a freeform drag may be in progress — refuse to interrupt it
  }
  const wasAwaitingGridOrigin = placementMode?.kind === 'grid-origin'
  setPlacementMode(mode)
  if (wasAwaitingGridOrigin) {
    setGridCreationKey((k) => k + 1)
  }
}
```

Update every "start a mode" call site to route through it:

```typescript
// handleGridOriginRequested — was: setPlacementMode({ kind: 'grid-origin' }); setPendingGridOrigin(null)
function handleGridOriginRequested() {
  startPlacementMode({ kind: 'grid-origin' })
  setPendingGridOrigin(null)
}
```

```tsx
{/* the "Placer ici" button's onClick — replace the whole inline handler */}
<button
  onClick={() => startPlacementMode({ kind: 'guide-line' })}
  disabled={guideLineBearing === null}
>
  Placer ici
</button>
```

```typescript
// handleSelectPhenomenonKind — deselecting (kind === null) is NOT routed
// through startPlacementMode: cancelling out of phenomenon mode can't ever
// be interrupting a freeform drag (placementMode is 'phenomenon' at that
// point, not 'freeform'), so there's nothing to guard against — always allow it.
function handleSelectPhenomenonKind(kind: PhenomenonKind | null) {
  if (kind === null) {
    setPlacementMode(null)
    return
  }
  startPlacementMode({ kind: 'phenomenon', phenomenonKind: kind })
}
```

```typescript
// handleStartFreeformTrace — was: setPlacementMode({ kind: 'freeform', freeformKind: kind })
// Now a toggle, mirroring PhenomenonPicker's own "click the active kind
// again to deselect" pattern: clicking the kind that's ALREADY armed cancels
// it directly (a deliberate self-cancel — safe even if a drag might be in
// progress, since the user is explicitly targeting the freeform tool
// itself, not switching to something unrelated). Clicking a NEW kind (or the
// same kind while a DIFFERENT mode is active) still goes through
// startPlacementMode, which still correctly refuses to interrupt an
// in-progress drag when switching AWAY to something else.
function handleStartFreeformTrace(kind: FreeformNetworkKind) {
  if (placementMode?.kind === 'freeform' && placementMode.freeformKind === kind) {
    setPlacementMode(null)
    return
  }
  startPlacementMode({ kind: 'freeform', freeformKind: kind })
}
```

```tsx
{/* src/components/SiteMapView.tsx — replace the freeform trace-start buttons
    (inside the existing CARD_CHROME_STYLE-wrapped div in the top-left
    OverlayPanel). Each button is now only disabled while a DIFFERENT mode
    (including the OTHER freeform kind) is active — not while its OWN kind is
    armed, so it can be clicked again to self-cancel. */}
<button
  onClick={() => handleStartFreeformTrace('eau')}
  disabled={placementMode !== null && !(placementMode.kind === 'freeform' && placementMode.freeformKind === 'eau')}
>
  Tracer l'eau
</button>
<button
  onClick={() => handleStartFreeformTrace('faille')}
  disabled={placementMode !== null && !(placementMode.kind === 'freeform' && placementMode.freeformKind === 'faille')}
>
  Tracer une faille
</button>
```

- [ ] **Step 4: Run the full suite to confirm all three new tests pass and nothing regressed**

Run: `node_modules/.bin/vitest.cmd run src/components/SiteMapView.test.tsx`
Expected: PASS — all three new tests, AND every pre-existing test in this file (in
particular `'does not let an in-progress guide-line placement leak into a grid-origin
click, or vice versa'`, `'clearing an already-placed guide line does not cancel an
unrelated pending grid-origin request'`, `'routes a map click to the guide-line tool...
when "Placer ici" cancels a pending grid-origin request'`, `'places several phenomena of
the same kind in a row without needing to reselect the kind'`, and the existing
`'captures a freeform trace, submits metadata, and saves it'` test (which starts freeform
mode via the SAME button whose disabled-condition just changed — confirm it still finds
and can click "Tracer l'eau" normally) — all exercise mode-start/mode-switch behavior this
task touches, and must still pass unchanged).

- [ ] **Step 5: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx
git commit -m "Add startPlacementMode: fixes GridCreationPanel stranding on phenomenon/freeform start, guards against interrupting an in-progress freeform drag, and restores a self-cancel toggle for armed-but-not-dragging freeform mode"
```

### Task 4: Don't discard a freeform trace when saving it fails

**Files:**
- Modify: `src/components/SiteMapView.tsx`
- Modify: `src/components/SiteMapView.test.tsx`

**Current bug:** `handleSubmitFreeformMetadata`'s `finally` block runs
`setPendingFreeformTrace(null)` and `setPlacementMode(null)` regardless of whether
`createFreeformNetwork` succeeded or threw. A failed save (transient network error, etc.)
loses the just-drawn trace — the metadata form disappears, and there's no way to retry
without redrawing the whole trace from scratch.

**Scope correction from an earlier draft of this task (caught in plan review): merely
preserving `pendingFreeformTrace` in React state is NOT enough on its own.**
`handleSubmitFreeformMetadata`'s `catch` block currently calls the same `setError(...)`
used for fatal load failures — and `SiteMapView.tsx`'s `if (error) return <p
role="alert">{error}</p>` (near the top of the render) replaces the ENTIRE component tree
(map, `OverlayPanel`, the metadata form, everything) the moment `error` is set, with no
dismiss affordance, since nothing anywhere in this file ever calls `setError(null)`. So
if this task changed ONLY the `finally`-vs-success-path clearing and left the `catch`
routing through `setError`, `pendingFreeformTrace` would technically survive in memory
but be completely unreachable/unobservable behind a permanent full-page blocking alert —
delivering no actual fix. This task must ALSO stop routing a failed freeform save through
the page-blocking `error` state, using the SAME pattern already established in this file
for exactly this kind of "optional flow, recoverable failure" case: `buildingError` (see
`buildingError`'s own declaration comment, and its rendering block with "Réessayer"/
"Fermer" buttons) is never allowed to blank the map; a failed freeform save should behave
the same way.

**Fix:** add a new `freeformSaveError` state (dismissible, mirroring `buildingError`
exactly). `handleSubmitFreeformMetadata`'s `catch` sets `freeformSaveError` instead of the
global `error`; only clears `pendingFreeformTrace`/`placementMode` on the SUCCESS path.
Render a dismissible error message next to the metadata form when `freeformSaveError` is
set, with a "Fermer" button. The user can then click "Valider" again on the still-open
form to retry, or "Annuler" to give up (which already correctly discards nothing-yet-
persisted state and should also clear `freeformSaveError`, so a later new trace doesn't
start with a stale error message showing).

- [ ] **Step 1: Write a failing test**

```tsx
// append to src/components/SiteMapView.test.tsx
it('keeps the pending freeform trace and metadata form open (with a dismissible error, not a page-blocking one) when saving fails, so the user can retry', async () => {
  vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
  vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
  vi.mocked(freeformNetworksRepo.createFreeformNetwork)
    .mockRejectedValueOnce(new Error('network down'))
    .mockResolvedValueOnce({
      id: 'fn1', planId: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      currentBearingDeg: null, depthM: null, flowRate: null, createdAt: '2026-07-21T10:00:00Z',
    })

  render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

  fireEvent.click(await screen.findByRole('button', { name: /tracer l'eau/i }))
  fireEvent.click(await screen.findByText('simulate-freeform-complete'))

  // First submit attempt fails.
  fireEvent.click(await screen.findByRole('button', { name: /valider le tracé/i }))
  await waitFor(() => expect(freeformNetworksRepo.createFreeformNetwork).toHaveBeenCalledTimes(1))

  // The failure must surface as a dismissible message, NOT the page-blocking
  // `error` state — the map/overlay must still be present, proving the whole
  // view wasn't replaced by <p role="alert">.
  expect(screen.getByText('network down')).toBeInTheDocument()
  expect(screen.getByTestId('map-view')).toBeInTheDocument()

  // The metadata form must still be present — the trace was NOT discarded.
  expect(screen.getByRole('button', { name: /valider le tracé/i })).toBeInTheDocument()

  // Retry, without redrawing — this must call createFreeformNetwork again with
  // the SAME points, proving pendingFreeformTrace survived the failure.
  fireEvent.click(screen.getByRole('button', { name: /valider le tracé/i }))
  await waitFor(() => expect(freeformNetworksRepo.createFreeformNetwork).toHaveBeenCalledTimes(2))
  expect(freeformNetworksRepo.createFreeformNetwork).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ planId: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })
  )

  // Second attempt succeeds — NOW the form and the error message should both be gone.
  await waitFor(() => expect(screen.queryByRole('button', { name: /valider le tracé/i })).not.toBeInTheDocument())
  expect(screen.queryByText('network down')).not.toBeInTheDocument()
})
```

Check the exact accessible name used for the submit button — Task 12 of the prior plan
added `aria-label="Valider le tracé"` to `FreeformMetadataForm`'s submit button
specifically to disambiguate it from the guide-line tool's own "Valider" button; verify
this is still the current text before relying on it in the query above.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/components/SiteMapView.test.tsx`
Expected: FAIL — on the current code, the first failed submit sets the page-blocking
`error` state, so `screen.getByTestId('map-view')` (and everything else queried
afterward) fails since the whole tree was replaced by `<p role="alert">`.

- [ ] **Step 3: Add `freeformSaveError` state and fix `handleSubmitFreeformMetadata`**

```typescript
// src/components/SiteMapView.tsx — add alongside the other useState declarations,
// near buildingError (same pattern, same reasoning: an optional-flow failure
// must never blank the whole map)
const [freeformSaveError, setFreeformSaveError] = useState<string | null>(null)
```

```typescript
// src/components/SiteMapView.tsx — replace handleSubmitFreeformMetadata
async function handleSubmitFreeformMetadata(metadata: FreeformMetadata) {
  if (!pendingFreeformTrace) return
  try {
    const created = await createFreeformNetwork({
      planId,
      kind: pendingFreeformTrace.kind,
      points: pendingFreeformTrace.points,
      ...metadata,
    })
    setFreeformNetworks((prev) => [...prev, created])
    // Only clear the pending trace / exit placement mode / clear any stale
    // error on SUCCESS — a failed save must leave the trace and the form
    // alone so the user can retry without redrawing from scratch.
    setPendingFreeformTrace(null)
    setPlacementMode(null)
    setFreeformSaveError(null)
  } catch (err) {
    // Routed through freeformSaveError, NOT the page-blocking `error` state
    // (see buildingError's declaration comment for the same reasoning) —
    // this is an optional, retryable action, not a fatal load failure; the
    // map/form/everything else must stay usable.
    setFreeformSaveError(err instanceof Error ? err.message : String(err))
  }
}
```

```typescript
// src/components/SiteMapView.tsx — handleCancelFreeformMetadata also clears
// freeformSaveError, so a later new trace doesn't start with a stale message
function handleCancelFreeformMetadata() {
  setPendingFreeformTrace(null)
  setPlacementMode(null)
  setFreeformSaveError(null)
}
```

```tsx
{/* src/components/SiteMapView.tsx — inside the existing
    `{pendingFreeformTrace && (...)}` block, alongside <FreeformMetadataForm>,
    same CARD_CHROME_STYLE wrapper it already uses */}
{pendingFreeformTrace && (
  <div style={CARD_CHROME_STYLE}>
    {freeformSaveError !== null && (
      <>
        <p role="alert">{freeformSaveError}</p>
        <button onClick={() => setFreeformSaveError(null)}>Fermer</button>
      </>
    )}
    <FreeformMetadataForm onSubmit={handleSubmitFreeformMetadata} onCancel={handleCancelFreeformMetadata} />
  </div>
)}
```

- [ ] **Step 4: Run the full suite to confirm the new test passes and nothing regressed**

Run: `node_modules/.bin/vitest.cmd run src/components/SiteMapView.test.tsx`
Expected: PASS — the new test, AND the pre-existing `'captures a freeform trace, submits
metadata, and saves it'` test (which only exercises the success path and should be
completely unaffected by this change).

- [ ] **Step 5: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx
git commit -m "Don't discard a freeform trace on a failed save — route the failure through a dismissible freeformSaveError, not the page-blocking error state"
```

**Chunk 2 exit criteria:** full suite green, `tsc -b --noEmit` clean. Every pre-existing
mode-interaction test (guide-line/grid-origin cross-cancellation, phenomenon
repeated-placement, freeform end-to-end) still passes, plus the 4 new regression tests
from Tasks 3 (three) and 4 (one).

---

## Chunk 3: Extract placement-mode logic into `usePlacementMode`

**Depends on Chunk 2 being committed.** This is a pure, behavior-preserving refactor —
moving already-correct logic to a new file, not fixing anything further. Do not start
until Chunk 2's fixes are committed and the full suite is green; extracting first and
fixing after would mean re-doing (or worse, re-discovering) Chunk 2's fixes a second time
inside the new hook file instead of once here.

### Task 5: Extract `PlacementMode` state + handlers into `usePlacementMode.ts`

**Files:**
- Create: `src/hooks/usePlacementMode.ts` + `src/hooks/usePlacementMode.test.ts`
- Modify: `src/components/SiteMapView.tsx` + `.test.tsx`

**Why:** `SiteMapView.tsx` has grown to ~890 lines and now owns 4 placement-mode variants
(grid-origin, guide-line, phenomenon, freeform) plus all their state and handlers, mixed
in with grid/felt-point/Bagua/building-footprint concerns that have nothing to do with
placement mode. Moving the placement-mode slice into its own hook (a) shrinks
`SiteMapView.tsx` back toward composition/rendering, (b) gives the mode-dispatch logic —
exactly the logic three separate bugs were just found in — its own small, independently
testable file instead of living inside the already-950-line `SiteMapView.test.tsx`.

**Scope — what moves into the hook, and what stays in `SiteMapView.tsx`:**

Moves into `usePlacementMode`:
- The `PlacementMode` type itself
- State: `placementMode`, `pendingGridOrigin`, `guideLineAnchor`, `guideLineBearing`,
  `customBearingInput`, `gridCreationKey`, `pendingFreeformTrace`, **and
  `freeformSaveError`** (added by Chunk 2 Task 4 — see the stale-sample warning below;
  this state is placement-mode-adjacent (it only exists to track a failed
  `handleSubmitFreeformMetadata` save) and moves along with it)
- `startPlacementMode`, `handleGridOriginRequested`, `handleMapClick`,
  `handleClearGuideLine`, `handleValidateCustomBearing`, `handleSelectPhenomenonKind`,
  `handleStartFreeformTrace`, `handleFreeformTraceComplete`,
  `handleSubmitFreeformMetadata`, `handleCancelFreeformMetadata`

Stays in `SiteMapView.tsx` (NOT moved — these are data-fetching/display concerns, not
placement-mode concerns):
- `phenomena`/`freeformNetworks` arrays themselves and their `useState`/loading-effect
  entries (the hook needs to APPEND to them when a placement succeeds, so it takes
  setter callbacks as parameters rather than owning the arrays)
- `instances`/`linesByInstance`/`feltPoints`/`feltSegments`/templates/visibility/error/
  building-footprint state — entirely unrelated to placement mode
- `handleGenerateGrid` — this is the grid-CREATION handler (fires once `pendingOrigin` and
  a polarity are both chosen), not a mode-START handler; it stays, since it's really
  about `createGridForPlan`, not about arming/disarming a placement mode. It still needs
  to call `setPlacementMode(null)`/`setPendingGridOrigin(null)`/bump `gridCreationKey` on
  success though — the hook must expose these as part of its return value.

**⚠️ IMPORTANT — the hook interface/sample code below predates Chunk 2's final form and
is stale for 3 functions. Do not implement it verbatim.** This plan's Chunk 3 section was
drafted before Chunk 2 Tasks 3/4 were finalized through plan review. By the time you
execute this task, Chunk 2 will already be committed and will have changed
`handleStartFreeformTrace` (added a self-cancel toggle — clicking the already-armed
freeform kind's own button again cancels it directly) and
`handleSubmitFreeformMetadata`/`handleCancelFreeformMetadata` (added `freeformSaveError`
routing instead of the global `error`/`onError` path, and dropped the unconditional
`finally` block in favor of success-only clearing) — see Chunk 2 Task 3 Step 3 and Task 4
Step 3 above for their real, final form. **Before writing `usePlacementMode.ts`, re-read
the ACTUAL current `SiteMapView.tsx` (post-Chunk-2, in your worktree) and lift these three
functions' real bodies from there — not from the sample code block below, which still
shows their PRE-Chunk-2 form and would silently reintroduce both of Chunk 2's just-fixed
bugs if copied as-is.** The rest of the sample (the type, the other 7 state
variables/handlers, the overall shape) is accurate and unaffected by Chunk 2.

**Hook interface (see the warning above — 3 of these functions are shown in their
pre-Chunk-2 form and must be re-derived from the real file before use):**

```typescript
// src/hooks/usePlacementMode.ts
import { useCallback, useState } from 'react'
import { createPhenomenon } from '../data/phenomenaRepo'
import { createFreeformNetwork } from '../data/freeformNetworksRepo'
import type { FreeformMetadata } from '../components/FreeformMetadataForm'
import type {
  Point, PhenomenonKind, Phenomenon, FreeformNetworkKind, FreeformNetwork,
} from '../domain/types'
import { latLngToLocal, type LatLng } from '../geometry/localCoordinates'

export type PlacementMode =
  | { kind: 'grid-origin' }
  | { kind: 'guide-line' }
  | { kind: 'phenomenon'; phenomenonKind: PhenomenonKind }
  | { kind: 'freeform'; freeformKind: FreeformNetworkKind }
  | null

export interface UsePlacementModeArgs {
  planId: string
  missionOrigin: LatLng
  onPhenomenonCreated: (phenomenon: Phenomenon) => void
  onFreeformNetworkCreated: (network: FreeformNetwork) => void
  // Only for handlePlacePhenomenon's failure path (a real load/action failure
  // with no better place to go) — NOT for handleSubmitFreeformMetadata's
  // failure path anymore, see freeformSaveError below (Chunk 2 Task 4).
  onError: (message: string) => void
}

export function usePlacementMode({
  planId,
  missionOrigin,
  onPhenomenonCreated,
  onFreeformNetworkCreated,
  onError,
}: UsePlacementModeArgs) {
  const [placementMode, setPlacementMode] = useState<PlacementMode>(null)
  const [pendingGridOrigin, setPendingGridOrigin] = useState<Point | null>(null)
  const [guideLineAnchor, setGuideLineAnchor] = useState<Point | null>(null)
  const [guideLineBearing, setGuideLineBearing] = useState<number | null>(null)
  const [customBearingInput, setCustomBearingInput] = useState('')
  const [gridCreationKey, setGridCreationKey] = useState(0)
  const [pendingFreeformTrace, setPendingFreeformTrace] = useState<{ kind: FreeformNetworkKind; points: Point[] } | null>(null)
  // Added by Chunk 2 Task 4 — dismissible, mirrors SiteMapView's own
  // buildingError pattern. Deliberately separate from the onError callback
  // above: a failed freeform save must stay recoverable (retry without
  // redrawing), not blank the whole app via the page-level error state.
  const [freeformSaveError, setFreeformSaveError] = useState<string | null>(null)

  function startPlacementMode(mode: PlacementMode) {
    if (placementMode?.kind === 'freeform' && pendingFreeformTrace === null) return
    const wasAwaitingGridOrigin = placementMode?.kind === 'grid-origin'
    setPlacementMode(mode)
    if (wasAwaitingGridOrigin) setGridCreationKey((k) => k + 1)
  }

  function handleGridOriginRequested() {
    startPlacementMode({ kind: 'grid-origin' })
    setPendingGridOrigin(null)
  }

  function handleMapClick(latlng: { lat: number; lng: number }) {
    if (placementMode?.kind === 'grid-origin') {
      setPendingGridOrigin(latLngToLocal(latlng, missionOrigin))
      setPlacementMode(null)
      return
    }
    if (placementMode?.kind === 'guide-line') {
      setGuideLineAnchor(latLngToLocal(latlng, missionOrigin))
      setPlacementMode(null)
      return
    }
    if (placementMode?.kind === 'phenomenon') {
      const local = latLngToLocal(latlng, missionOrigin)
      handlePlacePhenomenon(local, placementMode.phenomenonKind)
    }
  }

  async function handlePlacePhenomenon(local: Point, kind: PhenomenonKind) {
    try {
      const created = await createPhenomenon({ planId, kind, x: local.x, y: local.y })
      onPhenomenonCreated(created)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleClearGuideLine() {
    setGuideLineAnchor(null)
    setGuideLineBearing(null)
    if (placementMode?.kind === 'guide-line') {
      setPlacementMode(null)
    }
    setCustomBearingInput('')
  }

  function handleValidateCustomBearing() {
    const parsed = Number(customBearingInput)
    if (customBearingInput.trim() !== '' && !Number.isNaN(parsed)) {
      setGuideLineBearing(parsed)
    }
  }

  function handleSelectPhenomenonKind(kind: PhenomenonKind | null) {
    if (kind === null) {
      setPlacementMode(null)
      return
    }
    startPlacementMode({ kind: 'phenomenon', phenomenonKind: kind })
  }

  // Chunk 2 Task 3's self-cancel toggle: clicking the ALREADY-ARMED kind's
  // own button again cancels it directly, bypassing startPlacementMode's
  // freeform-drag guard (a deliberate self-cancel, not a switch to something
  // unrelated). RE-DERIVE THIS FROM THE REAL POST-CHUNK-2 FILE — see the
  // warning above this code block.
  function handleStartFreeformTrace(kind: FreeformNetworkKind) {
    if (placementMode?.kind === 'freeform' && placementMode.freeformKind === kind) {
      setPlacementMode(null)
      return
    }
    startPlacementMode({ kind: 'freeform', freeformKind: kind })
  }

  const handleFreeformTraceComplete = useCallback(
    (points: Point[]) => {
      if (placementMode?.kind !== 'freeform') return
      setPendingFreeformTrace({ kind: placementMode.freeformKind, points })
    },
    [placementMode]
  )

  // Chunk 2 Task 4's fix: routes failure through freeformSaveError (dismissible,
  // recoverable), NOT the onError/global-error path, and only clears
  // pendingFreeformTrace/placementMode on SUCCESS (no unconditional finally) —
  // so a failed save leaves the trace/form intact for a retry. RE-DERIVE THIS
  // FROM THE REAL POST-CHUNK-2 FILE — see the warning above this code block.
  async function handleSubmitFreeformMetadata(metadata: FreeformMetadata) {
    if (!pendingFreeformTrace) return
    try {
      const created = await createFreeformNetwork({
        planId,
        kind: pendingFreeformTrace.kind,
        points: pendingFreeformTrace.points,
        ...metadata,
      })
      onFreeformNetworkCreated(created)
      setPendingFreeformTrace(null)
      setPlacementMode(null)
      setFreeformSaveError(null)
    } catch (err) {
      setFreeformSaveError(err instanceof Error ? err.message : String(err))
    }
  }

  // Also clears freeformSaveError (Chunk 2 Task 4) so a later new trace
  // doesn't start with a stale message showing. RE-DERIVE THIS FROM THE REAL
  // POST-CHUNK-2 FILE — see the warning above this code block.
  function handleCancelFreeformMetadata() {
    setPendingFreeformTrace(null)
    setPlacementMode(null)
    setFreeformSaveError(null)
  }

  // Called by SiteMapView's handleGenerateGrid after a successful grid
  // creation — see this file's "stays in SiteMapView.tsx" note above for why
  // grid CREATION itself isn't moved here, but its placement-mode cleanup is
  // exposed for SiteMapView to call.
  function clearGridOriginPlacement() {
    setPlacementMode(null)
    setPendingGridOrigin(null)
    setGridCreationKey((k) => k + 1)
  }

  return {
    placementMode,
    pendingGridOrigin,
    guideLineAnchor,
    guideLineBearing,
    customBearingInput,
    gridCreationKey,
    pendingFreeformTrace,
    freeformSaveError,
    setFreeformSaveError,
    setCustomBearingInput,
    setGuideLineBearing,
    handleGridOriginRequested,
    handleMapClick,
    handleClearGuideLine,
    handleValidateCustomBearing,
    handleSelectPhenomenonKind,
    handleStartFreeformTrace,
    handleFreeformTraceComplete,
    handleSubmitFreeformMetadata,
    handleCancelFreeformMetadata,
    startPlacementMode,
    clearGridOriginPlacement,
  }
}
```

**This interface is a starting point, not gospel — if you find a genuinely better shape
while wiring it into `SiteMapView.tsx` (e.g. a field that turned out unnecessary, or a
naming clash), adjust it, but keep the file boundary (placement-mode-only) and don't
silently change any BEHAVIOR while doing so.** If anything about this interface seems
unworkable once you're actually wiring it in, stop and ask rather than guessing at a
redesign — this is exactly the kind of "architectural decision with multiple valid
approaches" the subagent-driven-development process wants surfaced, not silently decided.

- [ ] **Step 1: Write `usePlacementMode.test.ts` covering the logic being moved**

Port the placement-mode-specific tests that currently live in `SiteMapView.test.tsx` into
a dedicated test file for the hook, using `@testing-library/react`'s `renderHook`. At
minimum, port/adapt these existing `SiteMapView.test.tsx` cases (find them by their exact
current name in the worktree before starting — Chunk 2 will have added 4 new ones by the
time this task runs):
- `'does not let an in-progress guide-line placement leak into a grid-origin click, or vice versa'`
- `'clearing an already-placed guide line does not cancel an unrelated pending grid-origin request'`
- `'routes a map click to the guide-line tool, not grid-origin placement, when "Placer ici" cancels a pending grid-origin request'`
- `'places several phenomena of the same kind in a row without needing to reselect the kind'`
- `'selecting a phenomenon kind while a grid-origin request is pending does not strand GridCreationPanel'` (Chunk 2 Task 3)
- `'does not let starting another mode silently discard an in-progress freeform drag'` (Chunk 2 Task 3)
- `'cancels an armed (not-yet-dragging) freeform mode by clicking its own button again'` (Chunk 2 Task 3)

**Not ported — stays in `SiteMapView.test.tsx` as-is:** the existing `'captures a freeform
trace, submits metadata, and saves it'` success-path integration test depends on the
`FreeformDrawTool`/`FreeformNetworkLayer` render mocks and the full component tree to
exercise the end-to-end button→drag→form→save→layer-toggle flow — it's a rendering test,
not a pure hook-logic test, so it isn't a candidate for porting (same reasoning as the
thin rendering-only half of the Task 4 test described below).

Since `handleMapClick`/`handleSelectPhenomenonKind`/etc. don't need a real Leaflet
`<MapContainer>` to test (unlike the full `SiteMapView` integration tests, which render
through `MapView`'s mock to simulate a click), these can be pure `renderHook` +
`act(() => result.current.someHandler(...))` tests, calling the repo mocks directly rather
than going through simulated button clicks — faster and more targeted than the full
component-render tests they're replacing. Use `vi.mock('../data/phenomenaRepo')` and
`vi.mock('../data/freeformNetworksRepo')` exactly as `SiteMapView.test.tsx` already does.

**Chunk 2 Task 4's test needs splitting, not a straight port — one of its assertions is
rendering-dependent and can't be observed through `renderHook` alone:**
`'keeps the pending freeform trace and metadata form open (with a dismissible error, not a
page-blocking one) when saving fails, so the user can retry'` asserts BOTH hook-state
behavior (`pendingFreeformTrace` survives a failed save, `freeformSaveError` gets set,
both clear on a later success) AND a rendering fact (`screen.getByTestId('map-view')` is
still present — proving the failure did NOT go through the page-blocking global `error`
state). Split it into two:
1. **Port the hook-state half** into `usePlacementMode.test.ts`: call
   `result.current.handleSubmitFreeformMetadata(...)` with a rejected/then-resolved
   `createFreeformNetwork` mock, assert `result.current.freeformSaveError` is set after
   the failure and `result.current.pendingFreeformTrace` is still non-null, then assert
   both clear after a successful retry.
2. **Keep a thin version** in `SiteMapView.test.tsx` asserting only that the dismissible
   error card and the metadata form actually render correctly off the hook's exposed
   `freeformSaveError`/`pendingFreeformTrace` values (i.e., that the wiring in Step 5
   below is correct) — this doesn't need to re-test the hook's own state-transition
   logic, just that `SiteMapView.tsx` renders what the hook reports.

- [ ] **Step 2: Run the new hook test file to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/hooks/usePlacementMode.test.ts`
Expected: FAIL — `Cannot find module '../hooks/usePlacementMode'`

- [ ] **Step 3: Implement `usePlacementMode.ts`** (per the interface above, adjusted as needed)

- [ ] **Step 4: Run the new hook test file to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/hooks/usePlacementMode.test.ts`
Expected: PASS

- [ ] **Step 5: Wire the hook into `SiteMapView.tsx`, removing the now-duplicated state/handlers**

Replace every piece of state/handler this plan says moves into the hook with a single
`usePlacementMode(...)` call, threading `onPhenomenonCreated`/`onFreeformNetworkCreated` to
append to `SiteMapView`'s own `phenomena`/`freeformNetworks` state, and `onError` to
`SiteMapView`'s existing `setError` — this callback is now used ONLY by
`handlePlacePhenomenon`'s failure path (`handleSubmitFreeformMetadata`'s failure goes
through the hook's own internal `freeformSaveError` instead, per Chunk 2 Task 4; do not
wire `onError` to anything freeform-related). This is a pure relocation — the actual
`setPhenomena((prev) => [...prev, created])`-style logic doesn't change, just which file
it's written in.

Render the dismissible freeform-save-error card (the one Chunk 2 Task 4 added inside the
`{pendingFreeformTrace && (...)}` block) using the hook's exposed
`freeformSaveError`/`setFreeformSaveError` instead of local state — same JSX, just reading
off the hook's return value now.

Remove the corresponding tests that got ported into `usePlacementMode.test.ts` from
`SiteMapView.test.tsx` (don't leave duplicates — if a test now belongs to the hook, delete
it from `SiteMapView.test.tsx`, don't keep both), but keep the thin rendering-only version
of Chunk 2 Task 4's test described in Step 1 above.

Update `handleGenerateGrid` to call the hook's `clearGridOriginPlacement()` instead of its
own inline `setPlacementMode(null); setPendingGridOrigin(null); setGridCreationKey((k) =>
k + 1)`.

- [ ] **Step 6: Run the full suite and type-check**

Run: `node_modules/.bin/vitest.cmd run && node_modules/.bin/tsc.cmd -b --noEmit`
Expected: all pass, clean. Total test count should be roughly unchanged overall (tests
moved from `SiteMapView.test.tsx` to `usePlacementMode.test.ts`, not lost — if the count
dropped, something was deleted instead of ported; if it's much higher, something got
duplicated instead of moved).

- [ ] **Step 7: Commit**

```bash
git add src/hooks/usePlacementMode.ts src/hooks/usePlacementMode.test.ts src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx
git commit -m "Extract placement-mode state/handlers from SiteMapView.tsx into usePlacementMode"
```

**Chunk 3 exit criteria:** full suite green, `tsc -b --noEmit` clean, `SiteMapView.tsx`
noticeably smaller, all placement-mode logic (and its tests) now live in
`src/hooks/usePlacementMode.ts`/`.test.ts`, with zero behavior change anywhere.

---

**Whole-plan exit criteria:** full suite green, `tsc -b --noEmit` clean, all 5 disclosed
bugs fixed and regression-tested, `SiteMapView.tsx` extracted per Chunk 3. Manual
verification of Task 2's dev-server fix (Task 2 Step 7) is the only step that can't be
fully confirmed by automated tests — flag its result explicitly when reporting this
plan's completion.
