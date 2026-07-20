# Grid Line Vertex Insertion — Design

**Status:** Approved by Laurent (2026-07-20), pending spec-document-reviewer pass.

## 1. Context / motivation

Laurent needs to capture strong local grid deviations (a sacred site, a church, a
"vortex" — places where the felt network line visibly bends, not just drifts slightly)
by adding intermediate bend points to a grid line, not just nudging its two theoretical
endpoints. `GridLine.adjustedPoints` is already an arbitrary-length `Point[]` (not
capped at 2 — this is a separate, already-designed fact on `master`, in
`docs/superpowers/specs/2026-07-21-pathogenic-crossing-detection-design.md`, approved
but **not yet present on this worktree's `plan1-moteur-reseaux` branch** — verify it
has actually landed here before treating it as prior art at implementation time), so
the data model already supports this. The
question was whether the *editing UI* (`EditableNetworkLine.tsx`, built on
`leaflet-geoman-free` v2.20.0) already lets Laurent add a point, not just drag the two
endpoints — the component's own code carries a warning that its Geoman integration was
"a best-effort guess... VERIFY against the actual API," and its only existing test
(`EditableNetworkLine.test.tsx`) checks rendering, not interaction.

## 2. Investigation finding

Read directly from the installed `node_modules/@geoman-io/leaflet-geoman-free`
(v2.20.0) source, not assumed:

- Geoman's edit mode (`layer.pm.enable()`, called with no extra options today) creates
  a clickable/draggable "middle marker" between every pair of adjacent vertices by
  default (`hideMiddleMarkers: false` is the library default).
- Clicking a middle marker (`addVertexOn: 'click'`, the library default) promotes it
  to a real vertex **and fires `pm:vertexadded`** (plus a generic `pm:edit`) — **not**
  `pm:markerdragend`.
- `EditableNetworkLine.tsx` today only listens for `pm:markerdragend`. A vertex added
  by a plain click (no follow-up drag) is therefore inserted into Geoman's internal
  Leaflet layer and shown on screen, but **`onChanged` never fires** — the new point is
  silently lost on next reload, never reaching `GridLine.adjustedPoints` or the
  database. This is a real, currently-shipped data-loss gap, not a missing feature to
  build from scratch.
- A third gesture — dragging a middle marker directly (repositioning while creating
  it, no separate click first) — was traced further than the first draft of this spec
  did. `_onMiddleMarkerMoveStart` promotes the marker via the same `_addMarker` path as
  a click, which means it fires `pm:vertexadded` **immediately at drag-start**, at the
  marker's pre-drag (midpoint) position — not at the final, dragged-to position. The
  promoted marker also keeps the ordinary `dragstart`/`move`/`dragend` bindings every
  vertex marker has, so the same gesture is expected to **also** fire `pm:markerdragend`
  once the drag actually ends, this time with the final position. Net effect: this one
  gesture likely fires **both** events — an early `pm:vertexadded` with a stale
  (midpoint) position, then a later `pm:markerdragend` with the correct final position.
  See §4.2 for the consequence and the accepted scope decision.

## 3. Decisions (confirmed with Laurent)

- **What "add a point" means:** inserting an intermediate vertex into an *existing*
  theoretical grid line (Hartmann, Curry, etc.) — not a separate freeform
  annotation/zone object. The line stays the same network, just with more points than
  a straight 2-point segment.
- **Orthogonality-review suppression:** after adding a vertex (click-to-insert), the
  existing "Écart à l'orthogonal théorique / Redresser / Ignorer" panel (driven by
  `awaitingOrthogonalityReview` in `SiteMapView.tsx`) must **not** appear — offering to
  straighten a line the practitioner just deliberately bent to capture a real
  deviation would be actively confusing. The panel continues to appear, unchanged,
  after a plain drag of an existing vertex (the fine-adjustment use case it already
  serves well).

## 4. Design

### 4.1 `EditableNetworkLine` — listen for `pm:vertexadded`, signal change kind

`onChanged`'s signature gains a second parameter:

```typescript
export interface EditableNetworkLineProps {
  line: GridLine
  color: string
  missionOrigin: LatLng
  editable: boolean
  onChanged: (updated: GridLine, changeKind: 'drag' | 'vertex-added') => void
}
```

A second event listener is added alongside the existing `pm:markerdragend` one, bound
in the same `useEffect` (same dependency array, same `layer.on`/`layer.off` pattern).
Both listeners read `getLatLngs()` fresh (already the correct approach — it returns
every current vertex, not just the one that changed) and funnel through the same
`applyAllVertices`, differing only in the `changeKind` passed to `onChanged`:

- `pm:markerdragend` → `onChanged(updated, 'drag')` (existing behavior, unchanged)
- `pm:vertexadded` → `onChanged(updated, 'vertex-added')` (new)

The file's existing ⚠️ warning comment about "best-effort guess, VERIFY against the
actual API" is updated to reflect that `pm:markerdragend` is now genuinely verified
(read from source, and covered by a real interaction test — see §4.3) and
`pm:vertexadded` is verified for the click-only insertion path, with the direct-drag
insertion path called out as unverified (see §4.2).

### 4.2 `SiteMapView.handleLineChanged` — suppress review for `vertex-added`

```typescript
function handleLineChanged(instanceId: string, updated: GridLine, changeKind: 'drag' | 'vertex-added') {
  // ... existing undo-stack push, setLinesByInstance, updateAdjustedPoints call (unchanged)
  setLastChangedLine({ instanceId, lineId: updated.id })
  if (changeKind === 'drag') {
    setAwaitingOrthogonalityReview(updated.id)
  }
  // changeKind === 'vertex-added': deliberately does NOT set
  // awaitingOrthogonalityReview — see spec §3, offering to straighten a
  // line just after a deliberate bend would be actively confusing.
}
```

**Disclosed limitation:** as traced in §2, dragging a middle marker directly (instead
of clicking it, then optionally dragging the resulting real vertex separately) likely
fires **both** `pm:vertexadded` (immediately, at the stale midpoint position) and
`pm:markerdragend` (at gesture end, with the correct final position) for one gesture.
Concretely, this means: an extra, premature `onChanged(..., 'vertex-added')` call
happens first — pushing a transient, soon-superseded state onto the undo stack and
writing it to the database via `updateAdjustedPoints` — immediately followed by the
correct final `onChanged(..., 'drag')` call, which does show the orthogonality panel
(the disclosed gap already anticipated) and pushes a second, correct undo entry.
Net practical effect: one extra undo-stack entry (clicking "Annuler" once would revert
to the brief intermediate state rather than to before the vertex existed at all — a
minor "undo doesn't skip cleanly" annoyance, not data loss, since the final position is
still correctly saved) and one extra, harmless database write. This iteration accepts
this rather than adding a same-gesture de-duplication guard, because §4.4's UI hint
explicitly teaches the click-based gesture ("cliquez le point central... pour ajouter
un coude") as the intended workflow — the direct-drag gesture is a secondary,
unadvertised path whose rough edges are acceptable for now. Revisit if this proves
disruptive in the field.

**Call sites of `handleLineChanged`** (verified against the real
`src/components/SiteMapView.tsx`, not assumed) — there are three, and this design
affects them differently:
- The `EditableNetworkLine`'s `onChanged` wiring (current line 421) — this is the one
  §4.1/§4.2 redesign: it now passes through the real `changeKind` from Geoman.
- `handleResetLine` (current line 355, itself called from the "Réinitialiser" button)
  — calls `handleLineChanged` directly with a hardcoded literal; keep passing
  `'drag'` (resetting to the theoretical line is conceptually a "plain adjustment,"
  and showing the orthogonality panel after a reset is unchanged, existing behavior).
- The "Redresser" button inside the orthogonality-review panel itself (current line
  632) — also calls `handleLineChanged` directly; keep passing `'drag'` for the same
  reason (straightening is itself the panel's own action, not a vertex insertion).

**`handleUndo` is a separate case, not a third call site to update:** it does **not**
call `handleLineChanged` at all (verified: it has its own inline
`setUndoStack`/`setLinesByInstance`/`updateAdjustedPoints` calls and never touches
`setAwaitingOrthogonalityReview` or `setLastChangedLine`). It is therefore entirely
unaffected by this change — no edit needed there.

### 4.3 Testing

`EditableNetworkLine.test.tsx` gains its first real interaction tests (today it only
checks rendering). Both new tests render inside a real `<MapContainer>` (as the
existing render test already does), obtain the mounted Leaflet layer instance via the
component's ref, and call the layer's inherited `.fire(eventName, payload)` (standard
Leaflet `L.Evented` API) to simulate Geoman firing each event — this is the standard
way to test Geoman/Leaflet event wiring without simulating real pointer drags, which
jsdom cannot do for canvas/SVG-based map interactions:

- Firing `pm:markerdragend` with a `getLatLngs()` mock returning the same point count
  as `line.adjustedPoints` → `onChanged` called with `changeKind: 'drag'`.
- Firing `pm:vertexadded` (or the same `pm:markerdragend`-style payload, whichever the
  actual bound handler expects — confirm the exact payload shape Geoman passes to a
  `pm:vertexadded` listener before writing this test, since it wasn't traced in this
  design) with a `getLatLngs()` mock returning **one more point** than
  `line.adjustedPoints` → `onChanged` called with `changeKind: 'vertex-added'` and the
  updated `adjustedPoints` including the new point.

`SiteMapView.test.tsx`'s existing `EditableNetworkLine` mock (currently only
simulates a drag via a button, see `SiteMapView.test.tsx`'s `vi.mock('./EditableNetworkLine', ...)`)
gains a second simulate-button for the `'vertex-added'` case, and a new test confirms
`awaitingOrthogonalityReview`-driven UI (the review panel) does **not** appear after
that button is clicked, while confirming the existing drag-simulation test still shows
it (regression guard for §4.2's conditional).

### 4.4 UI discoverability

A short hint line is added under the "Mode édition" checkbox in `SiteMapView.tsx`'s
bottom-left `OverlayPanel` (the same card that already holds the edit-mode toggle and
Annuler/Réinitialiser buttons), shown only while `editMode` is on:

```tsx
{editMode && <p>Glissez un point pour l'ajuster, cliquez le point central entre deux points pour ajouter un coude.</p>}
```

## 5. Out of scope

- No new database column/table — `adjustedPoints`/`felt_segment` etc. already support
  arbitrary point counts.
- No automatic detection of "this is a strong deviation, suggest adding a point here"
  — Laurent decides where to bend the line based on his own felt readings.
- No perfect disambiguation of the drag-to-insert gesture from a plain existing-vertex
  drag (§4.2's disclosed limitation).
- No changes anticipated to `computeSegmentIntersection`/`computeHartmannCurryCrossings`
  (pathogenic-crossing detection) once that separate, already-approved work lands: its
  design iterates consecutive segment pairs of an arbitrary-length polyline, so a grid
  line gaining a bend point should already be handled correctly there. As of this
  spec's writing that code does not yet exist in this worktree/branch (verified: no
  match for either function under `src/`) — this is a forward-looking compatibility
  note, not a claim about code that's already running.

## 6. Files touched (summary for the implementation plan)

- Modify: `src/components/EditableNetworkLine.tsx` (+ `.test.tsx`) — listen for
  `pm:vertexadded`, `changeKind` param
- Modify: `src/components/SiteMapView.tsx` (+ `.test.tsx`) — `handleLineChanged` gains
  `changeKind`, conditional `awaitingOrthogonalityReview`, UI hint text
