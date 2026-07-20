# Grid Line Vertex Insertion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if
> subagents available) or superpowers:executing-plans to implement this plan. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a real, currently-shipped data-loss bug — clicking a Geoman "middle
marker" to insert a bend point into a grid line updates the map visually but never
saves the new point — and make the orthogonality-review panel skip itself after a
deliberate bend insertion (it only makes sense after a plain drag).

**Architecture:** `EditableNetworkLine.tsx` currently only listens for
`pm:markerdragend`. It gains a second listener for `pm:vertexadded` (Geoman's real
event for a click-to-insert vertex — confirmed by reading the installed library
source, not assumed), and both listeners now pass a `changeKind: 'drag' |
'vertex-added'` tag through `onChanged`. `SiteMapView.handleLineChanged` uses that tag
to conditionally skip showing the orthogonality-review panel. No changes to the
geometry layer (`applyAllVertices` already replaces `adjustedPoints` wholesale with
any-length array) or the database (`GridLine.adjustedPoints` already has no length cap).

**Tech Stack:** Vite, React, TypeScript, react-leaflet v5, leaflet v1.9.4,
`@geoman-io/leaflet-geoman-free` v2.20.0, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-20-grid-line-vertex-insertion-design.md` —
read this first. Contains the full investigation trail (grepped straight from the
installed Geoman/Leaflet source, not guessed) for why `pm:vertexadded` fires on a
plain click, why `_onMiddleMarkerMoveStart`'s promotion path deterministically means a
direct middle-marker drag fires `pm:vertexadded` (stale position) then
`pm:markerdragend` (final position) for one gesture, and why that's an accepted,
disclosed limitation rather than something this plan builds a de-dup guard for.

**Worktree:** `D:\LAURENT PC\GEOBIO\.worktrees\plan1-moteur-reseaux`, branch
`plan1-moteur-reseaux`. Node/npm may not be on PATH directly in Bash — use
`node_modules/.bin/vitest.cmd` / `node_modules/.bin/tsc.cmd`, or PowerShell where Node
is already on PATH.

---

## Chunk 1: Listen for `pm:vertexadded`, thread `changeKind` through

**Why one chunk:** the whole feature is two tightly-coupled edits (the event source in
`EditableNetworkLine`, the one consumer in `SiteMapView`) — splitting further would
leave an intermediate state where `onChanged`'s signature and its only real caller
disagree.

### Task 1: `EditableNetworkLine` — listen for both Geoman events, tag the change kind

**Files:**
- Modify: `src/components/EditableNetworkLine.tsx`
- Modify: `src/components/EditableNetworkLine.test.tsx`

**Current state (verified, read in full before writing this plan):** the file has one
`useEffect` (enable/disable `.pm` on `editable` change) and a second `useEffect` that
binds exactly one listener, `layer.on('pm:markerdragend', handleDragEnd)`, where
`handleDragEnd` reads `e.target.getLatLngs()`, converts every point via
`latLngToLocal`, and calls `onChanged(applyAllVertices(line, points))` — a single
argument. `onChanged`'s prop type is `(updated: GridLine) => void`. The file's only
existing test (`EditableNetworkLine.test.tsx`) renders with `editable={false}` and
checks color/dash/weight styling only — no interaction test exists yet.

- [ ] **Step 1: Write failing interaction tests**

These are the first real interaction tests for this component (the existing test only
covers rendering/styling). Both render inside a real `<MapContainer>` — Geoman's
`.pm.enable()` needs a real Leaflet layer to attach to, and this codebase has no
mock-Leaflet test setup — and get a handle on the actual rendered Leaflet `Polyline`
instance via the map's own layer registry (`eachLayer`), since `EditableNetworkLine`
keeps its internal `layerRef` private and doesn't expose it as a prop. Firing
`pm:markerdragend`/`pm:vertexadded` directly on that instance (Leaflet layers inherit
`.fire()`/`.on()`/`.off()` from `L.Evented`) simulates what Geoman would fire, without
needing to simulate a real pointer drag (which jsdom cannot do for SVG map
interactions anyway).

Append to `src/components/EditableNetworkLine.test.tsx` (add the new imports at the
top of the file alongside the existing ones):

```tsx
// add to the top imports
import type { Map as LeafletMap, Polyline as LeafletPolyline } from 'leaflet'
```

```tsx
// add inside the existing describe('EditableNetworkLine', ...) block, after the
// existing rendering test

  function renderEditableLine(onChanged: (updated: GridLine, changeKind: 'drag' | 'vertex-added') => void) {
    let map: LeafletMap | null = null
    render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18} ref={(m) => { map = m }}>
        <EditableNetworkLine
          line={line}
          color="#d32f2f"
          missionOrigin={{ lat: 48.8566, lng: 2.3522 }}
          editable
          onChanged={onChanged}
        />
      </MapContainer>
    )
    // Exactly one layer is rendered in this focused test (the EditableNetworkLine's
    // own Polyline) — grab it via the map's layer registry rather than instanceof,
    // since there's nothing else to disambiguate against here.
    let polyline: LeafletPolyline | null = null
    map?.eachLayer((layer) => {
      polyline = layer as unknown as LeafletPolyline
    })
    if (!polyline) throw new Error('Expected EditableNetworkLine to have rendered a Leaflet layer')
    return polyline
  }

  it('calls onChanged with changeKind "drag" when Geoman fires pm:markerdragend', () => {
    const onChanged = vi.fn()
    const polyline = renderEditableLine(onChanged)

    // Simulate Geoman having already updated the layer's vertices before firing
    // the drag-end event (matches how getLatLngs() is read fresh in the handler).
    polyline.setLatLngs([
      [48.8567, 2.3522],
      [48.8565, 2.3522],
    ])
    polyline.fire('pm:markerdragend', { target: polyline })

    expect(onChanged).toHaveBeenCalledTimes(1)
    const [updated, changeKind] = onChanged.mock.calls[0]
    expect(changeKind).toBe('drag')
    expect(updated.adjustedPoints).toHaveLength(2)
  })

  it('calls onChanged with changeKind "vertex-added" when Geoman fires pm:vertexadded', () => {
    const onChanged = vi.fn()
    const polyline = renderEditableLine(onChanged)

    // One more point than the original 2-point line — simulates a midpoint click
    // having inserted a real vertex between the two endpoints.
    polyline.setLatLngs([
      [48.8567, 2.3522],
      [48.8566, 2.3522],
      [48.8565, 2.3522],
    ])
    polyline.fire('pm:vertexadded', { target: polyline })

    expect(onChanged).toHaveBeenCalledTimes(1)
    const [updated, changeKind] = onChanged.mock.calls[0]
    expect(changeKind).toBe('vertex-added')
    expect(updated.adjustedPoints).toHaveLength(3)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/components/EditableNetworkLine.test.tsx`
Expected: FAIL — both new tests fail because `onChanged` is currently only ever
called with 1 argument (`changeKind` is `undefined`), and the `pm:vertexadded` case
additionally fails because nothing listens for that event at all (the first test may
also fail purely on the `toHaveBeenCalledTimes(1)`/`changeKind` assertion since
`pm:markerdragend` itself already works — that's expected, only the new second
argument is missing).

- [ ] **Step 3: Update `EditableNetworkLine`'s `onChanged` signature and event wiring**

```typescript
// src/components/EditableNetworkLine.tsx — replace the props interface
export interface EditableNetworkLineProps {
  line: GridLine
  color: string
  missionOrigin: LatLng
  editable: boolean
  onChanged: (updated: GridLine, changeKind: 'drag' | 'vertex-added') => void
}
```

```typescript
// src/components/EditableNetworkLine.tsx — replace the doc comment above the
// component (the old one says "best-effort guess... VERIFY" — both events are now
// verified against the installed library source, see the design spec §2)
/**
 * `pm:markerdragend` (dragging an existing vertex) and `pm:vertexadded` (clicking a
 * Geoman "middle marker" to insert a new one — the library's default
 * `addVertexOn: 'click'` behavior) are both verified against the installed
 * `@geoman-io/leaflet-geoman-free` v2.20.0 source — see
 * docs/superpowers/specs/2026-07-20-grid-line-vertex-insertion-design.md §2 for the
 * exact trace. A third gesture (dragging a middle marker directly, without a
 * separate click first) is expected to fire BOTH events for one gesture — a disclosed,
 * accepted limitation, see that spec's §4.2 — not something this component tries to
 * de-duplicate.
 */
```

```typescript
// src/components/EditableNetworkLine.tsx — replace the second useEffect (the one
// that currently only binds pm:markerdragend)
  useEffect(() => {
    const layer = layerRef.current as unknown as {
      on: (event: string, handler: (e: { target: { getLatLngs: () => { lat: number; lng: number }[] } }) => void) => void
      off: (event: string, handler: (e: { target: { getLatLngs: () => { lat: number; lng: number }[] } }) => void) => void
    } | null
    if (!layer) return

    // Fold every vertex from the gesture into a single updated GridLine, exactly
    // once per event (see applyAllVertices' doc comment for why looping per-vertex
    // would race) — shared between both event kinds, differing only in the
    // changeKind tag passed through to onChanged.
    function makeHandler(changeKind: 'drag' | 'vertex-added') {
      return function handle(e: { target: { getLatLngs: () => { lat: number; lng: number }[] } }) {
        const latlngs = e.target.getLatLngs()
        const points = latlngs.map((latlng) => latLngToLocal(latlng, missionOrigin))
        onChanged(applyAllVertices(line, points), changeKind)
      }
    }

    const handleDragEnd = makeHandler('drag')
    const handleVertexAdded = makeHandler('vertex-added')

    layer.on('pm:markerdragend', handleDragEnd)
    layer.on('pm:vertexadded', handleVertexAdded)
    return () => {
      layer.off('pm:markerdragend', handleDragEnd)
      layer.off('pm:vertexadded', handleVertexAdded)
    }
  }, [line, missionOrigin, onChanged])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/components/EditableNetworkLine.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: this will surface every call site of `EditableNetworkLine`'s `onChanged`
prop that now needs a second parameter — that's `SiteMapView.tsx`, fixed in Task 2. It
is expected/fine for `tsc` to report an error there right now; Task 2 fixes it before
this plan is done. Do not "fix" it here by adding a default parameter — the type error
is the intended signal to update every real call site.

```bash
git add src/components/EditableNetworkLine.tsx src/components/EditableNetworkLine.test.tsx
git commit -m "EditableNetworkLine: listen for pm:vertexadded, tag onChanged with changeKind"
```

### Task 2: `SiteMapView` — thread `changeKind` through, suppress review after insertion, add UI hint

**Files:**
- Modify: `src/components/SiteMapView.tsx`
- Modify: `src/components/SiteMapView.test.tsx`

**Current state (verified, read in full before writing this plan) — every real call
site of `handleLineChanged`, there are exactly 3, not the 2 you'd guess from a casual
read:**
1. Line 421 — the `<EditableNetworkLine onChanged={(updated) => handleLineChanged(instance.id, updated)}>`
   wiring. This is the one that needs the real `changeKind` threaded through.
2. Line 355 — `handleResetLine` (`handleLineChanged(instanceId, resetToTheoretical(line))`,
   called from the "Réinitialiser" button). Keep passing a hardcoded `'drag'` literal
   — resetting to the theoretical line is a plain adjustment, and showing the
   orthogonality panel afterward is existing, unchanged behavior.
3. Line 632 — the "Redresser" button inside the orthogonality-review panel itself
   (`handleLineChanged(reviewTarget.instance.id, {...})`). Also keep passing a
   hardcoded `'drag'` literal — straightening is the panel's own action, unrelated to
   vertex insertion.

**`handleUndo` (lines 338-350) is NOT a 4th call site — it never calls
`handleLineChanged` at all.** It has its own fully separate inline
`setUndoStack`/`setLinesByInstance`/`updateAdjustedPoints` logic and never touches
`setAwaitingOrthogonalityReview`. Do not edit it as part of this task.

- [ ] **Step 1: Update `SiteMapView.test.tsx`'s `EditableNetworkLine` mock**

Read the current mock first (`vi.mock('./EditableNetworkLine', ...)`, around line
60-66) — it currently renders one button that calls `onChanged` with a single
hardcoded updated line. Replace it with two buttons, one per `changeKind`, so
different tests can simulate either:

```tsx
vi.mock('./EditableNetworkLine', () => ({
  EditableNetworkLine: ({ line, onChanged }: { line: { id: string; adjustedPoints: { x: number; y: number }[] }; onChanged: (l: unknown, changeKind: 'drag' | 'vertex-added') => void }) => (
    <>
      <button onClick={() => onChanged({ ...line, adjustedPoints: [{ x: 0, y: -10 }, { x: 1, y: 10 }] }, 'drag')}>
        simulate-line-change-{line.id}
      </button>
      <button onClick={() => onChanged({ ...line, adjustedPoints: [{ x: 0, y: -10 }, { x: 0.5, y: 0 }, { x: 1, y: 10 }] }, 'vertex-added')}>
        simulate-vertex-added-{line.id}
      </button>
    </>
  ),
}))
```

(The existing button's name `simulate-line-change-{line.id}` is unchanged, so no
existing test that clicks it needs to change — only its handler now also passes
`'drag'` explicitly, matching what it already implicitly tested.)

- [ ] **Step 2: Write a failing test for orthogonality-panel suppression**

The file already has exactly the setup helper this needs — `renderWithLineChangedOnce()`
(around line 292), which mocks the repos, renders, enters edit mode, makes the
Hartmann layer visible, and clicks `simulate-line-change-gl1`. Add a sibling helper
right after it that does the same setup but clicks the new vertex-added button
instead, and place the new test alongside the existing orthogonality-panel tests
(directly after the `'shows the orthogonality-assist panel...'` test, around line 315):

```tsx
  async function renderWithVertexAddedOnce() {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([hartmannInstance])
    vi.mocked(gridLinesRepo.listGridLinesForInstance).mockResolvedValue([hartmannLine])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(gridLinesRepo.updateAdjustedPoints).mockResolvedValue(hartmannLine)

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
    await screen.findByTestId('map-view')

    fireEvent.click(screen.getByLabelText(/mode édition/i))
    fireEvent.click(screen.getByLabelText('Hartmann'))
    fireEvent.click(await screen.findByText('simulate-vertex-added-gl1'))
  }

  it('does not show the orthogonality-review panel after a vertex-added change', async () => {
    await renderWithVertexAddedOnce()
    expect(screen.queryByText(/écart à l'orthogonal théorique/i)).not.toBeInTheDocument()
  })
```

(The companion "still shows it after a drag" case is already covered by the existing
`'shows the orthogonality-assist panel and preview after a line is adjusted'` test via
`renderWithLineChangedOnce()` — no need to duplicate it; this new test only needs to
add the previously-untested negative case.)

- [ ] **Step 3: Run tests to verify the new test fails**

Run: `node_modules/.bin/vitest.cmd run src/components/SiteMapView.test.tsx`
Expected: FAIL (or a `tsc` error first, from Task 1 Step 5's dangling type error) —
`handleLineChanged` doesn't accept/use `changeKind` yet.

- [ ] **Step 4: Update `handleLineChanged` and its 3 call sites**

```typescript
// src/components/SiteMapView.tsx — replace handleLineChanged (currently around line 322)
  function handleLineChanged(instanceId: string, updated: GridLine, changeKind: 'drag' | 'vertex-added') {
    setUndoStack((prev) => ({
      ...prev,
      [instanceId]: [...(prev[instanceId] ?? []), linesByInstance[instanceId].find((l) => l.id === updated.id)!],
    }))
    setLinesByInstance((prev) => ({
      ...prev,
      [instanceId]: prev[instanceId].map((l) => (l.id === updated.id ? updated : l)),
    }))
    updateAdjustedPoints(updated.id, updated.adjustedPoints).catch((err) =>
      setError(err instanceof Error ? err.message : String(err))
    )
    setLastChangedLine({ instanceId, lineId: updated.id })
    if (changeKind === 'drag') {
      setAwaitingOrthogonalityReview(updated.id)
    }
    // changeKind === 'vertex-added': deliberately does NOT set
    // awaitingOrthogonalityReview — see design spec §3: offering to straighten a
    // line the practitioner just deliberately bent to capture a real deviation
    // would be actively confusing.
  }
```

Update the 3 call sites:

```typescript
// src/components/SiteMapView.tsx:355 — handleResetLine, unchanged except the added literal
    handleLineChanged(instanceId, resetToTheoretical(line), 'drag')
```

```typescript
// src/components/SiteMapView.tsx:421 — the EditableNetworkLine wiring, now threads
// the real changeKind through instead of hardcoding one
                  onChanged={(updated, changeKind) => handleLineChanged(instance.id, updated, changeKind)}
```

```typescript
// src/components/SiteMapView.tsx:632 — the "Redresser" button, unchanged except the added literal
                  handleLineChanged(reviewTarget.instance.id, {
                    ...reviewTarget.line,
                    adjustedPoints: reviewSuggestion.suggestedPoints,
                  }, 'drag')
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/components/SiteMapView.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 6: Add the UI discoverability hint**

In the bottom-left `OverlayPanel` (the card with the "Mode édition" checkbox and
Annuler/Réinitialiser buttons, around line 577-601), add a short hint shown only
while `editMode` is on:

```tsx
// src/components/SiteMapView.tsx — inside the bottom-left OverlayPanel's
// CARD_CHROME_STYLE div, after the "Mode édition" <label> and before the "Annuler"
// button
          {editMode && (
            <p>Glissez un point pour l'ajuster, cliquez le point central entre deux points pour ajouter un coude.</p>
          )}
```

This is plain text content, not interactive — no new test required for it
specifically (it isn't gated by any state this plan needs to verify beyond `editMode`,
which existing tests already exercise).

- [ ] **Step 7: Type-check, run the full suite, and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: clean — this resolves the dangling error flagged in Task 1 Step 5.

Run: `node_modules/.bin/vitest.cmd run`
Expected: all tests green (full suite, not just this file — confirms nothing else in
the app called `handleLineChanged`, `EditableNetworkLine`, or its `onChanged` prop in
a way this plan missed)

```bash
git add src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx
git commit -m "SiteMapView: thread changeKind through handleLineChanged, suppress orthogonality review after a vertex insertion, add edit-mode hint"
```
