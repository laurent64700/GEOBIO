# Pathogenic Crossing Detection Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if
> subagents available) or superpowers:executing-plans to implement this plan. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect and render Hartmann×Curry line-crossing points on the map, recomputed
live from each network's field-adjusted geometry, as a new toggleable layer.

**Architecture:** A pure geometry module (`computeSegmentIntersection` +
`computeHartmannCurryCrossings`) that treats `GridLine.adjustedPoints` as a polyline
(not a 2-point segment — a field-edited line can have many vertices) and iterates
consecutive segment pairs across both networks. `SiteMapView` derives the crossing list
as a plain inline value recomputed on every render (no new fetch, no new persisted
table — this is entirely computed, unlike `GridInstance`/`GridLine`), and renders it
through a new presentational layer component following the exact pattern already
established by `FeltPointsLayer`/`BaguaLayer`.

**Deviation from spec:** the approved spec (§4/§5) calls for `useMemo`. This plan
deviates — see Task 4 Step 2 for the justification (matching `SiteMapView`'s own
established inline-derivation convention). Flag this to Laurent as a disclosed
deviation, not something the spec itself endorsed.

**Tech Stack:** Same as the rest of GEOBIO — Vite, React, TypeScript, react-leaflet,
Vitest + Testing Library. No new dependency, no new database table, no new migration.

**Spec:** `docs/superpowers/specs/2026-07-21-pathogenic-crossing-detection-design.md` —
read this first for the full rationale (why Hartmann+Curry is the fixed core, why water/
phenomena aggravation is explicitly deferred, the geometric edge cases this plan's tests
cover).

**Worktree:** This plan executes in the same worktree as Plan 1/Bagua/rod-marker
detection (all already implemented, 183 tests green as of this plan's writing):
`D:\LAURENT PC\GEOBIO\.worktrees\plan1-moteur-reseaux`, branch `plan1-moteur-reseaux`.
Node/npm may not be on PATH directly — use `node_modules/.bin/vitest.cmd` /
`node_modules/.bin/tsc.cmd` if `npx` fails, after `export PATH="/c/Program Files/nodejs:$PATH"`
in Bash, or use PowerShell where Node is already on PATH.

---

## Chunk 1: Geometry, rendering, and integration

**Why this is one chunk:** the whole feature is small (one new pure module, one new
presentational component, two small edits to existing files) and every piece depends on
the one before it — splitting further would just add commit overhead without isolating
independently-shippable value.

### Task 1: `computeSegmentIntersection` — pure line-segment intersection

**Files:**
- Create: `src/geometry/pathogenicCrossings.ts`
- Test: `src/geometry/pathogenicCrossings.test.ts`

- [ ] **Step 1: Write failing tests for segment intersection**

```typescript
// src/geometry/pathogenicCrossings.test.ts
import { describe, it, expect } from 'vitest'
import { computeSegmentIntersection } from './pathogenicCrossings'

describe('computeSegmentIntersection', () => {
  it('finds the intersection of two crossing segments', () => {
    // A vertical segment (0,-5)-(0,5) crossed by a horizontal segment (-5,0)-(5,0)
    const result = computeSegmentIntersection(
      { x: 0, y: -5 }, { x: 0, y: 5 },
      { x: -5, y: 0 }, { x: 5, y: 0 }
    )
    expect(result).toEqual({ x: 0, y: 0 })
  })

  it('returns null for parallel segments', () => {
    const result = computeSegmentIntersection(
      { x: 0, y: 0 }, { x: 0, y: 10 },
      { x: 5, y: 0 }, { x: 5, y: 10 }
    )
    expect(result).toBeNull()
  })

  it('returns null when the lines intersect but outside both segments\' bounds', () => {
    // Same two lines as the first test, but shrunk so they no longer reach (0,0)
    const result = computeSegmentIntersection(
      { x: 0, y: 1 }, { x: 0, y: 5 },
      { x: -5, y: 0 }, { x: -1, y: 0 }
    )
    expect(result).toBeNull()
  })

  it('counts an intersection exactly on a segment endpoint as valid (inclusive bounds)', () => {
    // The crossing point (0,0) is the exact endpoint of the second segment.
    const result = computeSegmentIntersection(
      { x: 0, y: -5 }, { x: 0, y: 5 },
      { x: 0, y: 0 }, { x: 5, y: 0 }
    )
    expect(result).toEqual({ x: 0, y: 0 })
  })

  // No dedicated "-0 normalization" test: verified by exhaustive search (2M random
  // segment pairs, plus a systematic sweep of literal -0 endpoints) that this
  // formula's arithmetic cannot actually produce a -0 result — `a1.x + t*d1x`
  // resolves to +0 under IEEE 754 addition rules in every case tried, including
  // when a1.x is itself a literal -0. The `x === 0 ? 0 : x` normalization in the
  // implementation below is kept as cheap defensive code (harmless, matches the
  // established -0-awareness convention from gridGeneration.test.ts) but isn't
  // exercised by a test, since no real input reaches that branch.
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/geometry/pathogenicCrossings.test.ts`
Expected: FAIL — `Cannot find module './pathogenicCrossings'`

- [ ] **Step 3: Implement `computeSegmentIntersection`**

```typescript
// src/geometry/pathogenicCrossings.ts
import type { Point } from '../domain/types'

const EPSILON = 1e-9

/**
 * Standard 2D line-segment intersection via parametric form. Returns the
 * intersection point if segments a1-a2 and b1-b2 cross within their own
 * bounds (t, u both in [0,1] INCLUSIVE — a crossing exactly on an endpoint
 * counts), or null if the segments are parallel/near-parallel (determinant
 * near zero, compared against an epsilon rather than exact equality — real
 * floating-point line angles are never exactly parallel) or if the
 * intersection of the underlying infinite lines falls outside either
 * segment. Colinear/overlapping segments are deliberately treated as
 * "parallel → null" (no single well-defined crossing point) rather than a
 * special case — not expected to occur between the fixed-angle networks
 * this is built for (Hartmann 0°, Curry 45°).
 */
export function computeSegmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d1x = a2.x - a1.x
  const d1y = a2.y - a1.y
  const d2x = b2.x - b1.x
  const d2y = b2.y - b1.y

  const denominator = d1x * d2y - d1y * d2x
  if (Math.abs(denominator) < EPSILON) return null // parallel or near-parallel

  const dx = b1.x - a1.x
  const dy = b1.y - a1.y
  const t = (dx * d2y - dy * d2x) / denominator
  const u = (dx * d1y - dy * d1x) / denominator

  if (t < 0 || t > 1 || u < 0 || u > 1) return null

  const x = a1.x + t * d1x
  const y = a1.y + t * d1y
  return { x: x === 0 ? 0 : x, y: y === 0 ? 0 : y } // normalize -0 to 0
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/geometry/pathogenicCrossings.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/geometry/pathogenicCrossings.ts src/geometry/pathogenicCrossings.test.ts
git commit -m "Add computeSegmentIntersection: pure line-segment intersection with inclusive bounds"
```

---

### Task 2: `computeHartmannCurryCrossings` — polyline-aware crossing detection

**Files:**
- Modify: `src/geometry/pathogenicCrossings.ts` + `.test.ts`

**Critical detail, already resolved during spec review — read carefully:**
`GridLine.adjustedPoints` is a `Point[]` of arbitrary length, NOT a 2-point segment. A
line edited in the field (dragging a vertex via `EditableNetworkLine.tsx`/leaflet-geoman)
can have many vertices — this is the whole reason `src/geometry/orthogonality.ts`
already exists for N-point polylines. This function must iterate **consecutive segment
pairs** of each line, not treat a whole line as one segment from its first point to its
last. A single pair of lines can produce **more than one** crossing (a bent Hartmann
line can cross a Curry line twice) — this is correct behavior, not a bug to deduplicate.

- [ ] **Step 1: Write failing tests for the crossing detection**

```typescript
// append to src/geometry/pathogenicCrossings.test.ts
import { computeHartmannCurryCrossings } from './pathogenicCrossings'
import type { GridLine } from '../domain/types'

function makeLine(id: string, family: 'axis-a' | 'axis-b', points: { x: number; y: number }[]): GridLine {
  return {
    id,
    gridInstanceId: family === 'axis-a' ? 'hartmann-instance' : 'curry-instance',
    family,
    polarity: '+',
    reinforced: false,
    theoreticalPoints: points,
    adjustedPoints: points,
  }
}

describe('computeHartmannCurryCrossings', () => {
  it('finds one crossing between a straight Hartmann line and a straight Curry line', () => {
    const hartmann = [makeLine('h1', 'axis-a', [{ x: 0, y: -5 }, { x: 0, y: 5 }])]
    const curry = [makeLine('c1', 'axis-b', [{ x: -5, y: 0 }, { x: 5, y: 0 }])]

    const crossings = computeHartmannCurryCrossings(hartmann, curry)

    expect(crossings).toHaveLength(1)
    expect(crossings[0]).toEqual({ point: { x: 0, y: 0 }, hartmannLineId: 'h1', curryLineId: 'c1' })
  })

  it('finds zero crossings when the lines do not meet within their bounds', () => {
    const hartmann = [makeLine('h1', 'axis-a', [{ x: 10, y: -5 }, { x: 10, y: 5 }])]
    const curry = [makeLine('c1', 'axis-b', [{ x: -5, y: 0 }, { x: 5, y: 0 }])]

    expect(computeHartmannCurryCrossings(hartmann, curry)).toHaveLength(0)
  })

  it('finds two crossings when a bent (3-point) Hartmann line crosses a Curry line twice', () => {
    // A Hartmann line bent into a "V" shape around y=0, crossing a horizontal
    // Curry line at two distinct x positions — the exact case that would be
    // silently wrong if the whole line were treated as one segment from its
    // first point (0,-5) to its last point (4,-5), which never crosses y=0 at all.
    const hartmann = [
      makeLine('h1', 'axis-a', [
        { x: 0, y: -5 },
        { x: 2, y: 5 },
        { x: 4, y: -5 },
      ]),
    ]
    const curry = [makeLine('c1', 'axis-b', [{ x: -5, y: 0 }, { x: 10, y: 0 }])]

    const crossings = computeHartmannCurryCrossings(hartmann, curry)

    expect(crossings).toHaveLength(2)
    expect(crossings.every((c) => c.hartmannLineId === 'h1' && c.curryLineId === 'c1')).toBe(true)
  })

  it('finds no crossings when there are no Curry lines', () => {
    const hartmann = [makeLine('h1', 'axis-a', [{ x: 0, y: -5 }, { x: 0, y: 5 }])]
    expect(computeHartmannCurryCrossings(hartmann, [])).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/geometry/pathogenicCrossings.test.ts`
Expected: FAIL — `computeHartmannCurryCrossings is not a function`

- [ ] **Step 3: Implement `computeHartmannCurryCrossings`**

```typescript
// src/geometry/pathogenicCrossings.ts — add
import type { GridLine, Point } from '../domain/types'

export interface PathogenicCrossing {
  point: Point
  hartmannLineId: string
  curryLineId: string
}

/**
 * All Hartmann×Curry crossing points across two sets of grid lines, using
 * each line's adjustedPoints (field-calibrated positions — see spec §1 for
 * why this is the "truth" per Laurent's methodology, not theoreticalPoints).
 * Iterates every consecutive segment pair of every Hartmann line against
 * every consecutive segment pair of every Curry line — NOT whole lines as
 * single segments, see this task's note above. One line pair can contribute
 * multiple entries.
 */
export function computeHartmannCurryCrossings(
  hartmannLines: GridLine[],
  curryLines: GridLine[]
): PathogenicCrossing[] {
  const crossings: PathogenicCrossing[] = []

  for (const hartmannLine of hartmannLines) {
    for (const curryLine of curryLines) {
      for (let i = 0; i < hartmannLine.adjustedPoints.length - 1; i++) {
        const h1 = hartmannLine.adjustedPoints[i]
        const h2 = hartmannLine.adjustedPoints[i + 1]
        for (let j = 0; j < curryLine.adjustedPoints.length - 1; j++) {
          const c1 = curryLine.adjustedPoints[j]
          const c2 = curryLine.adjustedPoints[j + 1]
          const point = computeSegmentIntersection(h1, h2, c1, c2)
          if (point) {
            crossings.push({ point, hartmannLineId: hartmannLine.id, curryLineId: curryLine.id })
          }
        }
      }
    }
  }

  return crossings
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/geometry/pathogenicCrossings.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/geometry/pathogenicCrossings.ts src/geometry/pathogenicCrossings.test.ts
git commit -m "Add computeHartmannCurryCrossings: polyline-aware crossing detection, multiple crossings per line pair"
```

---

### Task 3: `PathogenicCrossingsLayer` — Leaflet rendering

**Files:**
- Create: `src/components/PathogenicCrossingsLayer.tsx`
- Test: `src/components/PathogenicCrossingsLayer.test.tsx`

**Same family as `FeltPointsLayer`/`BaguaLayer`** — a separate presentational component
because `SiteMapView.test.tsx` mocks every layer down to a stub with no real Leaflet
context, so a real `<CircleMarker>` rendered directly in `SiteMapView`'s JSX would crash
in that test file.

- [ ] **Step 1: Write failing tests for `PathogenicCrossingsLayer`**

```tsx
// src/components/PathogenicCrossingsLayer.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { PathogenicCrossingsLayer } from './PathogenicCrossingsLayer'
import type { PathogenicCrossing } from '../geometry/pathogenicCrossings'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const crossings: PathogenicCrossing[] = [
  { point: { x: 0, y: 0 }, hartmannLineId: 'h1', curryLineId: 'c1' },
  { point: { x: 2, y: 3 }, hartmannLineId: 'h2', curryLineId: 'c1' },
]

describe('PathogenicCrossingsLayer', () => {
  it('renders one marker per crossing', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <PathogenicCrossingsLayer crossings={crossings} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(2)
  })

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <PathogenicCrossingsLayer crossings={crossings} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })

  it('renders nothing when there are no crossings', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <PathogenicCrossingsLayer crossings={[]} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/components/PathogenicCrossingsLayer.test.tsx`
Expected: FAIL — `Cannot find module './PathogenicCrossingsLayer'`

- [ ] **Step 3: Implement `PathogenicCrossingsLayer`**

```tsx
// src/components/PathogenicCrossingsLayer.tsx
import { CircleMarker } from 'react-leaflet'
import type { PathogenicCrossing } from '../geometry/pathogenicCrossings'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'

export interface PathogenicCrossingsLayerProps {
  crossings: PathogenicCrossing[]
  missionOrigin: LatLng
  visible: boolean
}

// Orange/red, distinct from the Bagua layer's purple and from any seeded
// network color (red/yellow/blue/purple/green — see 0005_seed_confirmed_networks.sql).
const CROSSING_COLOR = '#e65100'

export function PathogenicCrossingsLayer({ crossings, missionOrigin, visible }: PathogenicCrossingsLayerProps) {
  if (!visible) return null

  return (
    <>
      {crossings.map((crossing, index) => {
        const latlng = localToLatLng(crossing.point, missionOrigin)
        return (
          <CircleMarker
            key={`${crossing.hartmannLineId}-${crossing.curryLineId}-${index}`}
            center={[latlng.lat, latlng.lng]}
            radius={6}
            pathOptions={{ color: CROSSING_COLOR, fillOpacity: 0.9 }}
          />
        )
      })}
    </>
  )
}
```

(Key includes `index` because a single line pair can produce two crossings — see Task 2
— so `hartmannLineId-curryLineId` alone would collide.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/components/PathogenicCrossingsLayer.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/components/PathogenicCrossingsLayer.tsx src/components/PathogenicCrossingsLayer.test.tsx
git commit -m "Add PathogenicCrossingsLayer: renders H×C crossing markers"
```

---

### Task 4: Wire into `LayerPanel` and `SiteMapView`

**Files:**
- Modify: `src/components/LayerPanel.tsx` + `.test.tsx`
- Modify: `src/components/SiteMapView.tsx` + `.test.tsx`

- [ ] **Step 1: Add a layer id and checkbox to `LayerPanel`**

Add a failing test first, following this file's existing test structure exactly (it
already has a "hidden by default, like grid layers" pattern for `BAGUA_LAYER_ID` —
mirror that test, not the felt-points one, since this layer should also start hidden).

```typescript
// src/components/LayerPanel.tsx — add alongside FELT_POINTS_LAYER_ID/BAGUA_LAYER_ID
export const PATHOGENIC_CROSSINGS_LAYER_ID = 'pathogenic-crossings'
```

Add a checkbox in the JSX (after the existing Bagua checkbox, same structure), defaulting
to hidden (`?? false`, matching `BAGUA_LAYER_ID`'s pattern — not `?? true` like felt
points):

```tsx
      <label>
        <input
          type="checkbox"
          checked={visibility[PATHOGENIC_CROSSINGS_LAYER_ID] ?? false}
          onChange={() => onToggle(PATHOGENIC_CROSSINGS_LAYER_ID)}
        />
        Croisements pathogènes
      </label>
```

Run: `node_modules/.bin/vitest.cmd run src/components/LayerPanel.test.tsx`
Expected: PASS (once the new test + implementation both land)

- [ ] **Step 2: Derive crossings in `SiteMapView` and render the layer**

Read the current `src/components/SiteMapView.tsx` in full first — it has grown across
many prior tasks (Bagua, building footprint, guide-line, edit mode); confirm the exact
current line numbers before editing, this plan's line references may have shifted.

```typescript
// src/components/SiteMapView.tsx — add imports
import { computeHartmannCurryCrossings } from '../geometry/pathogenicCrossings'
import { PathogenicCrossingsLayer } from './PathogenicCrossingsLayer'
import { PATHOGENIC_CROSSINGS_LAYER_ID } from './LayerPanel' // add to the existing named import from './LayerPanel'

// ... inside SiteMapView, after `const gridLayers = ...`. DEVIATION FROM SPEC:
// the approved spec (§4/§5) says to derive this via `useMemo`. This plan uses a
// plain derived value instead, recomputed on every render — matching this
// file's own established style for reviewTarget/reviewSuggestion/gridLayers
// (none of which use useMemo, and the file doesn't import it at all). The cost
// is negligible (small line counts per plan, two nested loops over segment
// pairs), so introducing this file's first useMemo for one derived value would
// add inconsistency without a measurable benefit. This is a deliberate choice
// made during planning, not something the spec itself calls for — flag it to
// Laurent during review; swap to useMemo if profiling ever shows otherwise.
const hartmannLines = instances
  .filter((i) => i.templateSnapshot.name === 'Hartmann')
  .flatMap((i) => linesByInstance[i.id] ?? [])
const curryLines = instances
  .filter((i) => i.templateSnapshot.name === 'Curry')
  .flatMap((i) => linesByInstance[i.id] ?? [])
const pathogenicCrossings = computeHartmannCurryCrossings(hartmannLines, curryLines)
```

```tsx
// ... in the JSX, inside <MapView>, alongside the other layers (after
// <BaguaLayer .../>):
<PathogenicCrossingsLayer
  crossings={pathogenicCrossings}
  missionOrigin={missionOrigin}
  visible={visibility[PATHOGENIC_CROSSINGS_LAYER_ID] ?? false}
/>
```

**Note on the "all Hartmann×Curry pairs" hypothesis (spec §4):** if a plan has multiple
Hartmann or multiple Curry `GridInstance`s, this computes crossings across every
Hartmann line and every Curry line regardless of which instance they belong to — the
spec flags this as an assumption to confirm with Laurent, not something to second-guess
here; implement as written.

- [ ] **Step 3: Write a failing integration test, then make it pass**

```tsx
// append to src/components/SiteMapView.test.tsx
// Mock PathogenicCrossingsLayer the same way BaguaLayer/FeltPointsLayer
// already are in this file (grep for their vi.mock calls to match the exact
// pattern) — it renders a real CircleMarker that needs a real Leaflet
// context this file's mocked MapView doesn't provide.
vi.mock('./PathogenicCrossingsLayer', () => ({
  PathogenicCrossingsLayer: ({ crossings, visible }: { crossings: unknown[]; visible: boolean }) =>
    visible ? <div data-testid="pathogenic-crossings-count">{crossings.length}</div> : null,
}))

it('computes and shows Hartmann×Curry crossings once the layer is toggled visible', async () => {
  vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([
    { id: 'gi-h', planId: 'p1', templateSnapshot: { id: 't-h', name: 'Hartmann', spacingXM: 1.8, spacingYM: 2.5, angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0, color: '#d32f2f', vibratoryBase: 7 }, originX: 0, originY: 0 },
    { id: 'gi-c', planId: 'p1', templateSnapshot: { id: 't-c', name: 'Curry', spacingXM: 4, spacingYM: 4, angleTrueNorthDeg: 45, originOffsetX: 0, originOffsetY: 0, color: '#f2c230', vibratoryBase: 5 }, originX: 0, originY: 0 },
  ])
  vi.mocked(gridLinesRepo.listGridLinesForInstance).mockImplementation(async (instanceId) =>
    instanceId === 'gi-h'
      ? [{ id: 'h1', gridInstanceId: 'gi-h', family: 'axis-a', polarity: '+', reinforced: false, theoreticalPoints: [{ x: 0, y: -5 }, { x: 0, y: 5 }], adjustedPoints: [{ x: 0, y: -5 }, { x: 0, y: 5 }] }]
      : [{ id: 'c1', gridInstanceId: 'gi-c', family: 'axis-b', polarity: '+', reinforced: false, theoreticalPoints: [{ x: -5, y: 0 }, { x: 5, y: 0 }], adjustedPoints: [{ x: -5, y: 0 }, { x: 5, y: 0 }] }]
  )
  vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

  render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

  fireEvent.click(await screen.findByLabelText(/croisements pathogènes/i))

  expect(await screen.findByTestId('pathogenic-crossings-count')).toHaveTextContent('1')
})
```

**Adapt this test's exact mock setup to match `SiteMapView.test.tsx`'s established
conventions** — check how `gridInstancesRepo`/`gridLinesRepo`/`feltPointsRepo` are
already mocked at the top of that file (likely `vi.mock('../data/...')` + auto-mock, not
a manual factory) before writing this test literally as shown above.

Run: `node_modules/.bin/vitest.cmd run src/components/SiteMapView.test.tsx`
Expected: FAIL first (nothing wired), then PASS once Step 2 lands.

- [ ] **Step 4: Run the full suite and type-check**

Run: `node_modules/.bin/vitest.cmd run && node_modules/.bin/tsc.cmd -b --noEmit`
Expected: all pass, no type errors, no regression in prior test counts

- [ ] **Step 5: Manually verify in the browser**

Run: `npm run dev`. Reach a mission with both a Hartmann and a Curry `GridInstance`
generated on the same plan (created programmatically via `createGridForPlan` for now —
no UI gap here, `GridCreationPanel` already lets Laurent do this from the map screen).
Toggle "Croisements pathogènes" in the layer panel. Expected: orange markers appear at
every point where a Hartmann line crosses a Curry line; dragging a line (edit mode) and
releasing updates the markers live, without any explicit "recalculate" action.

- [ ] **Step 6: Commit**

```bash
git add src/components/LayerPanel.tsx src/components/LayerPanel.test.tsx src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx
git commit -m "Wire Hartmann×Curry crossing detection into SiteMapView's layer panel"
```

---

**Chunk 1 / plan exit criteria:** `node_modules/.bin/vitest.cmd run` and
`node_modules/.bin/tsc.cmd -b --noEmit` both pass. From the map screen, once a plan has
both a Hartmann and a Curry grid, Laurent can toggle a "Croisements pathogènes" layer
showing every point where the two networks' field-adjusted lines cross, recomputed live
as he edits either network — no explicit recalculation step, no new data persisted.

## Explicitly out of scope (spec §7, unchanged)

- Aggravation by water/fault tracing or point phenomena — depends on the sibling
  "freeform + phenomena" sub-project (spec + plan being written separately); the
  architecture here doesn't need to anticipate it, per the spec's own resolution of an
  earlier inconsistency (§2: the extension shape is deferred, not pre-built).
- Single-network internal nodes (Hartmann×Hartmann) — explicitly excluded by Laurent's
  definition.
- Crossings involving networks other than Hartmann/Curry (Palm×Peyré, etc.).
- Click-for-detail UI on a crossing marker — the data model supports it
  (`PathogenicCrossing` keeps both line IDs) but no UI is built for it in this plan.
