# Tracé libre eau/faille + phénomènes ponctuels Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if
> subagents available) or superpowers:executing-plans to implement this plan. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two missing field-workflow pieces from Plan 1's original design —
point phenomena (telluric chimneys, vortex, etc., click-to-place) and freeform
water/fault tracing with metadata (current bearing, depth, flow rate) — both as new
toggleable map layers with dedicated placement tools.

**Architecture:** Component B (phenomena) is a simple click-to-place tool reusing the
existing single-click map-interaction mechanism. Component A (freeform tracing) needs a
genuinely new mechanism — continuous pointer capture (mousedown→mousemove→mouseup) — since
Leaflet-Geoman's free tier has no freehand line mode (verified against the installed
package; Laurent's locked-in decision is a GEOBIO-owned capture, not a Geoman dependency).
Both tools plug into a **consolidated placement-mode state** (Task 1): the existing
2-boolean mutual-exclusion mechanism (`awaitingGridOrigin`/`placingGuideLine`) already
required both "start" handlers to manually clear each other — extending that pattern to
a 3rd and 4th mode would repeat the exact bug class already hit twice this session
(`toggleLayer` forgetting a new layer id, `DEFAULT_VISIBLE_LAYER_IDS` drift). Task 1
replaces the 2 booleans with one discriminated-union state, so "start mode X" can never
leave two modes active — there's only one state to set.

**Tech Stack:** Same as the rest of GEOBIO — Vite, React, TypeScript, react-leaflet,
Supabase, Vitest + Testing Library. No new dependency (freehand capture uses
`useMapEvents`, already used by `MapView.tsx`/`EditableNetworkLine.tsx`).

**Spec:** `docs/superpowers/specs/2026-07-21-freeform-and-phenomena-design.md` — read
this first, especially §2 (the locked-in "no Geoman for freeform" decision) and §7 (the
explicit note that B and A are independent chantiers, B first).

**Worktree:** Create a fresh worktree off current `master` (this plan was written after
`master` absorbed three prior plans — FeltSegment/network colors, grid-line vertex
insertion, pathogenic crossings — so don't reuse an old worktree path):

```bash
cd "D:\LAURENT PC\GEOBIO"
git worktree add .worktrees/freeform-and-phenomena -b freeform-and-phenomena
cp .env.local .worktrees/freeform-and-phenomena/.env.local
cd .worktrees/freeform-and-phenomena
npm install
```

Node/npm may not be on PATH directly in Bash — use `node_modules/.bin/vitest.cmd` /
`node_modules/.bin/tsc.cmd`, or PowerShell where Node is already on PATH.

---

## Chunk 1: Phénomènes ponctuels (Component B) + placement-mode consolidation

**Why B first:** per spec §7's closing note — B has no Geoman/pointer-capture
dependency and is immediately buildable; A is the heavier chantier. This chunk also
does the one-time mode-consolidation refactor both components need.

### Task 1: Consolidate placement-mode state into one discriminated union

**Files:**
- Modify: `src/components/SiteMapView.tsx` + `.test.tsx`

**Why this is a real, in-scope refactor, not scope creep:** `SiteMapView.tsx` currently
has `awaitingGridOrigin`/`placingGuideLine` as two independent booleans, with a comment
at `handleGridOriginRequested` explicitly noting exclusivity is "actively enforced" only
because both start-handlers manually clear the other flag. This plan adds a 3rd mode now
(phenomenon placement) and a 4th in Chunk 2 (freeform draw) — extending the manual
pairwise-clearing pattern to 4 flags means every new "start X" handler must remember to
clear the other 3, the exact bug class already caught twice this session in this same
file (`toggleLayer` forgetting `FELT_SEGMENTS_LAYER_ID`, checkbox defaults drifting from
`DEFAULT_VISIBLE_LAYER_IDS`). A single state variable makes "two modes active at once"
structurally impossible instead of manually prevented.

**Read `src/components/SiteMapView.tsx` and `.test.tsx` in full before starting** — line
numbers below are from this plan's writing; re-verify before editing.

- [ ] **Step 1: Write a failing test for the one case existing coverage misses**

`SiteMapView.test.tsx` already has two tests directly exercising cross-cancellation
between guide-line and grid-origin placement (search for
`'does not let an in-progress guide-line placement leak into a grid-origin click, or
vice versa'` and the "Placer ici cancels a pending grid-origin request" test) — those
already pin the behavior this refactor must preserve for the "start X cancels Y" paths,
and running the full suite after the refactor re-validates them for free. Don't
duplicate them.

**What's genuinely uncovered or (a real bug caught in plan review) forgotten by the
current design's own `handleClearGuideLine`:** clearing an already-placed guide line
(the "Effacer" button) must NOT cancel an unrelated PENDING grid-origin request that
was started afterward. The original code's `handleClearGuideLine` never touched
`awaitingGridOrigin` — a naive `PlacementMode` refactor could accidentally start doing
so, since both "clear the guide line" and "cancel a pending mode" would otherwise
collapse onto the same `setPlacementMode(null)` call. Add this test, placed right after
the existing "does not let an in-progress guide-line placement leak..." test:

```tsx
it('clearing an already-placed guide line does not cancel an unrelated pending grid-origin request', async () => {
  vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
  vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
  vi.mocked(createGridForPlan).mockResolvedValue({ instance: mockHartmannInstance, lines: [] })

  render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
  await screen.findByTestId('map-view')

  // 1. Place a guide line successfully — guideLineAnchor is now set, no mode pending.
  fireEvent.click(screen.getByRole('button', { name: 'N/S' }))
  fireEvent.click(screen.getByRole('button', { name: /placer/i }))
  fireEvent.click(screen.getByText('simulate-map-click'))
  expect(await screen.findByTestId('guide-line')).toBeInTheDocument()

  // 2. Start a grid-origin request — pending, does NOT touch guideLineAnchor,
  // so "Effacer" (disabled only when guideLineAnchor is null) stays enabled.
  fireEvent.click(screen.getByRole('button', { name: /ajouter une grille/i }))
  fireEvent.click(await screen.findByText('simulate-select-hartmann'))

  // 3. Clear the (old, already-placed) guide line.
  fireEvent.click(screen.getByRole('button', { name: 'Effacer' }))
  expect(screen.queryByTestId('guide-line')).not.toBeInTheDocument()

  // 4. The map click should STILL complete the grid-origin placement that was
  // pending before step 3 — proving Effacer didn't silently cancel it. If it
  // did, this click would do nothing and the polarity toggle would never appear.
  fireEvent.click(screen.getByText('simulate-map-click'))
  expect(await screen.findByRole('button', { name: '+' })).toBeInTheDocument()
})
```

- [ ] **Step 1b: Run the full existing suite to confirm nothing is broken yet (pre-refactor baseline)**

Run: `node_modules/.bin/vitest.cmd run src/components/SiteMapView.test.tsx`
Expected: every pre-existing test PASSES (unmodified code); the new test from Step 1
also PASSES already at this point — it exercises only pre-refactor code, so it's not a
"red" TDD step in the usual sense. Its purpose is to fail LATER if Step 3's refactor is
implemented naively (i.e. if `handleClearGuideLine` becomes an unconditional
`setPlacementMode(null)` instead of the guarded version in Step 3 below) — run it again
after Step 3 specifically to confirm this.

- [ ] **Step 2: Replace the two booleans with one discriminated union**

```typescript
// src/components/SiteMapView.tsx — replace these two lines:
//   const [pendingGridOrigin, setPendingGridOrigin] = useState<Point | null>(null)
//   const [awaitingGridOrigin, setAwaitingGridOrigin] = useState(false)
// and these two lines:
//   const [guideLineAnchor, setGuideLineAnchor] = useState<Point | null>(null)
//   const [placingGuideLine, setPlacingGuideLine] = useState(false)
// (guideLineAnchor itself is NOT part of the mode state — it's the placed result,
// independent of whether placement mode is currently active — keep it as its own
// useState, only placingGuideLine folds into the union)

// Add near the top of the file, alongside other type imports:
type PlacementMode =
  | { kind: 'grid-origin' }
  | { kind: 'guide-line' }
  | null

// Replace the removed booleans with:
const [placementMode, setPlacementMode] = useState<PlacementMode>(null)
const [pendingGridOrigin, setPendingGridOrigin] = useState<Point | null>(null)
const [guideLineAnchor, setGuideLineAnchor] = useState<Point | null>(null)
```

Update every reader/writer of the old booleans:

```typescript
// handleGridOriginRequested — was: setAwaitingGridOrigin(true); setPendingGridOrigin(null); setPlacingGuideLine(false)
function handleGridOriginRequested() {
  setPlacementMode({ kind: 'grid-origin' })
  setPendingGridOrigin(null)
}
```

```typescript
// the "Placer ici" button's onClick — was: setPlacingGuideLine(true); if (awaitingGridOrigin) { setAwaitingGridOrigin(false); setGridCreationKey(...) }
onClick={() => {
  const wasAwaitingGridOrigin = placementMode?.kind === 'grid-origin'
  setPlacementMode({ kind: 'guide-line' })
  if (wasAwaitingGridOrigin) {
    // GridCreationPanel was mid-flow — force-remount so it doesn't keep showing a
    // stale "cliquez l'origine" prompt for a click that will now go elsewhere.
    setGridCreationKey((k) => k + 1)
  }
}}
```

```typescript
// handleMapClick — was: if (awaitingGridOrigin) {...}; if (placingGuideLine) {...}
function handleMapClick(latlng: { lat: number; lng: number }) {
  if (placementMode?.kind === 'grid-origin') {
    setPendingGridOrigin(latLngToLocal(latlng, missionOrigin))
    setPlacementMode(null)
    return
  }
  if (placementMode?.kind === 'guide-line') {
    setGuideLineAnchor(latLngToLocal(latlng, missionOrigin))
    setPlacementMode(null)
  }
}
```

```typescript
// handleClearGuideLine — was: ...; setPlacingGuideLine(false); ...
//
// BEHAVIOR-PRESERVATION TRAP (caught in plan review, must implement exactly
// as written here): a naive `setPlacementMode(null)` here is NOT equivalent
// to the original `setPlacingGuideLine(false)`. Reachable sequence: (1) place
// a guide line — guideLineAnchor is set, no mode is pending; (2) start a
// grid-origin request (placementMode becomes {kind:'grid-origin'}) — this
// does NOT touch guideLineAnchor, which is still non-null, so "Effacer"
// stays enabled; (3) click "Effacer" to clear the OLD guide line. The
// original code's handleClearGuideLine never touched awaitingGridOrigin, so
// step (2)'s pending grid-origin request survived step (3) and the next map
// click still completed it correctly. An unconditional setPlacementMode(null)
// would instead silently cancel that unrelated pending mode AND leave
// GridCreationPanel showing a stale "cliquez l'origine" prompt for a click
// that no longer does anything (nothing bumps gridCreationKey on this path).
// Fix: only clear placementMode if it's currently 'guide-line' — clearing a
// placed guide-line result must never cancel an unrelated pending mode.
function handleClearGuideLine() {
  setGuideLineAnchor(null)
  setGuideLineBearing(null)
  if (placementMode?.kind === 'guide-line') {
    setPlacementMode(null)
  }
  setCustomBearingInput('')
}
```

```tsx
// MapView's onMapClick prop — was: onMapClick={awaitingGridOrigin || placingGuideLine ? handleMapClick : undefined}
onMapClick={placementMode !== null ? handleMapClick : undefined}
```

Remove the now-unused `handleGuideLineMapClick` function if its body was folded
directly into `handleMapClick` above (check whether anything else still calls it).

- [ ] **Step 3: Run the full suite to confirm the refactor is behavior-preserving**

Run: `node_modules/.bin/vitest.cmd run src/components/SiteMapView.test.tsx`
Expected: PASS (every pre-existing test, plus both new tests from Step 1 — critically,
the "clearing an already-placed guide line does not cancel an unrelated pending
grid-origin request" test must still pass here, proving `handleClearGuideLine`'s
`placementMode?.kind === 'guide-line'` guard was implemented, not skipped)

- [ ] **Step 4: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx
git commit -m "Consolidate grid-origin/guide-line placement flags into one PlacementMode union"
```

### Task 2: `phenomenon` table + `Phenomenon` domain type

**Files:**
- Create: `supabase/migrations/0016_phenomenon.sql`
- Modify: `src/domain/types.ts`

**Checkpoint humain:** write and commit the migration file; do NOT apply it to the
remote database — that requires explicit human go-ahead, handled outside this task, same
convention as every prior migration this session.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0016_phenomenon.sql
create table phenomenon (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plan(id) on delete cascade,
  kind text not null check (kind in (
    'cheminee-1', 'cheminee-2', 'cheminee-3', 'cheminee-4',
    'spire-vortex', 'point-cosmique', 'carre-magique', 'tube-magique'
  )),
  x double precision not null,
  y double precision not null,
  created_at timestamptz not null default now()
);
create index phenomenon_plan_id_idx on phenomenon(plan_id);
```

(`double precision` for `x`/`y`, matching every other geometry column in this schema —
see `felt_point`, `felt_segment`. The `kind` list matches spec §4B's proposed 8 values,
explicitly flagged there as "à confirmer avec Laurent" — implement as specified, don't
second-guess the exact list here.)

- [ ] **Step 2: Add the `PhenomenonKind`/`Phenomenon` types**

```typescript
// src/domain/types.ts — add after FeltSegment
export type PhenomenonKind =
  | 'cheminee-1'
  | 'cheminee-2'
  | 'cheminee-3'
  | 'cheminee-4'
  | 'spire-vortex'
  | 'point-cosmique'
  | 'carre-magique'
  | 'tube-magique'

export interface Phenomenon {
  id: string
  planId: string
  kind: PhenomenonKind
  x: number
  y: number
  createdAt: string
}
```

- [ ] **Step 3: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: clean (nothing consumes these yet)

```bash
git add supabase/migrations/0016_phenomenon.sql src/domain/types.ts
git commit -m "Add phenomenon table migration and Phenomenon domain type"
```

### Task 3: `phenomenaRepo.ts`

**Files:**
- Create: `src/data/phenomenaRepo.ts`
- Test: `src/data/phenomenaRepo.test.ts`

Structural mirror of `src/data/feltPointsRepo.ts`, with a `deletePhenomenon` added
(spec §4B: a phenomenon is placed immediately on click with no confirmation step, so an
accidental tap needs a way to undo it — the repo function is scoped here; **no delete UI
is built in this plan**, matching the existing precedent of `deleteFeltPoint` in this
same codebase, which has existed since Task 26 with no UI ever calling it. Flag this to
Laurent as a disclosed scope decision, not an oversight, when reviewing this plan.)

- [ ] **Step 1: Write failing tests**

```typescript
// src/data/phenomenaRepo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPhenomenon, deletePhenomenon, listPhenomenaForPlan } from './phenomenaRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('phenomenaRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a phenomenon', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: { id: 'ph1', plan_id: 'p1', kind: 'spire-vortex', x: 1, y: 2, created_at: '2026-07-21T10:00:00Z' },
      error: null,
    })
    vi.mocked(supabase).from = from

    const phenomenon = await createPhenomenon({ planId: 'p1', kind: 'spire-vortex', x: 1, y: 2 })

    expect(from).toHaveBeenCalledWith('phenomenon')
    expect(chain.insert).toHaveBeenCalledWith({ plan_id: 'p1', kind: 'spire-vortex', x: 1, y: 2 })
    expect(phenomenon.kind).toBe('spire-vortex')
  })

  it('throws a descriptive French error when creation fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(
      createPhenomenon({ planId: 'p1', kind: 'point-cosmique', x: 0, y: 0 })
    ).rejects.toThrow("Impossible d'enregistrer le phénomène : network down")
  })

  it('lists phenomena scoped to a plan', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [{ id: 'ph1', plan_id: 'p1', kind: 'tube-magique', x: 0, y: 0, created_at: '2026-07-21T10:00:00Z' }],
      error: null,
    })
    vi.mocked(supabase).from = from

    const phenomena = await listPhenomenaForPlan('p1')

    expect(chain.eq).toHaveBeenCalledWith('plan_id', 'p1')
    expect(phenomena).toHaveLength(1)
    expect(phenomena[0].kind).toBe('tube-magique')
  })

  it('deletes a phenomenon', async () => {
    const { from, chain } = createSupabaseChainMock({ data: null, error: null })
    vi.mocked(supabase).from = from

    await deletePhenomenon('ph1')

    expect(from).toHaveBeenCalledWith('phenomenon')
    expect(chain.eq).toHaveBeenCalledWith('id', 'ph1')
  })

  it('throws a descriptive French error when deletion fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(deletePhenomenon('ph1')).rejects.toThrow(
      'Impossible de supprimer le phénomène : network down'
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/data/phenomenaRepo.test.ts`
Expected: FAIL — `Cannot find module './phenomenaRepo'`

- [ ] **Step 3: Implement `phenomenaRepo.ts`**

```typescript
// src/data/phenomenaRepo.ts
import { supabase } from '../lib/supabaseClient'
import type { Phenomenon, PhenomenonKind } from '../domain/types'

export interface CreatePhenomenonInput {
  planId: string
  kind: PhenomenonKind
  x: number
  y: number
}

interface PhenomenonRow {
  id: string
  plan_id: string
  kind: PhenomenonKind
  x: number
  y: number
  created_at: string
}

function mapRowToPhenomenon(row: PhenomenonRow): Phenomenon {
  return { id: row.id, planId: row.plan_id, kind: row.kind, x: row.x, y: row.y, createdAt: row.created_at }
}

export async function createPhenomenon(input: CreatePhenomenonInput): Promise<Phenomenon> {
  const { data, error } = await supabase
    .from('phenomenon')
    .insert({ plan_id: input.planId, kind: input.kind, x: input.x, y: input.y })
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer le phénomène : ${error.message}`)
  return mapRowToPhenomenon(data as PhenomenonRow)
}

export async function deletePhenomenon(id: string): Promise<void> {
  const { error } = await supabase.from('phenomenon').delete().eq('id', id)
  if (error) throw new Error(`Impossible de supprimer le phénomène : ${error.message}`)
}

export async function listPhenomenaForPlan(planId: string): Promise<Phenomenon[]> {
  const { data, error } = await supabase.from('phenomenon').select().eq('plan_id', planId)
  if (error) throw new Error(`Impossible de charger les phénomènes : ${error.message}`)
  return (data as PhenomenonRow[]).map(mapRowToPhenomenon)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/data/phenomenaRepo.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/phenomenaRepo.ts src/data/phenomenaRepo.test.ts
git commit -m "Add phenomenaRepo: CRUD for phenomenon, mirroring feltPointsRepo"
```

### Task 4: `PhenomenaLayer` — Leaflet rendering

**Files:**
- Create: `src/components/PhenomenaLayer.tsx`
- Test: `src/components/PhenomenaLayer.test.tsx`

Same family as `FeltPointsLayer`. Real icons are out of scope (spec §7) — render a
small text-label `CircleMarker` (the kind's short code) as a placeholder, swappable for
real icons later without changing the data model or this component's props.

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/PhenomenaLayer.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { PhenomenaLayer } from './PhenomenaLayer'
import type { Phenomenon } from '../domain/types'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const phenomena: Phenomenon[] = [
  { id: 'ph1', planId: 'p1', kind: 'spire-vortex', x: 0, y: 0, createdAt: '2026-07-21T10:00:00Z' },
  { id: 'ph2', planId: 'p1', kind: 'cheminee-2', x: 3, y: 4, createdAt: '2026-07-21T10:01:00Z' },
]

describe('PhenomenaLayer', () => {
  it('renders one marker per phenomenon', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <PhenomenaLayer phenomena={phenomena} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(2)
  })

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <PhenomenaLayer phenomena={phenomena} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })

  it('renders nothing when there are no phenomena', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <PhenomenaLayer phenomena={[]} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/components/PhenomenaLayer.test.tsx`
Expected: FAIL — `Cannot find module './PhenomenaLayer'`

- [ ] **Step 3: Implement `PhenomenaLayer`**

```tsx
// src/components/PhenomenaLayer.tsx
import { CircleMarker, Tooltip } from 'react-leaflet'
import type { Phenomenon } from '../domain/types'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'

export interface PhenomenaLayerProps {
  phenomena: Phenomenon[]
  missionOrigin: LatLng
  visible: boolean
}

// Placeholder text codes standing in for real icons (spec §7 — real icons from
// Laurent's legend sheet are out of scope for this pass). Swapping these for
// real icon assets later only touches this map, not the data model or callers.
const KIND_LABELS: Record<Phenomenon['kind'], string> = {
  'cheminee-1': 'Ch1',
  'cheminee-2': 'Ch2',
  'cheminee-3': 'Ch3',
  'cheminee-4': 'Ch4',
  'spire-vortex': 'Vx',
  'point-cosmique': 'Cos',
  'carre-magique': 'CM',
  'tube-magique': 'TM',
}

const PHENOMENON_COLOR = '#6a1b9a'

export function PhenomenaLayer({ phenomena, missionOrigin, visible }: PhenomenaLayerProps) {
  if (!visible) return null

  return (
    <>
      {phenomena.map((phenomenon) => {
        const latlng = localToLatLng(phenomenon, missionOrigin)
        return (
          <CircleMarker
            key={phenomenon.id}
            center={[latlng.lat, latlng.lng]}
            radius={8}
            pathOptions={{ color: PHENOMENON_COLOR, fillOpacity: 0.85 }}
          >
            <Tooltip permanent direction="center" className="phenomenon-label">
              {KIND_LABELS[phenomenon.kind]}
            </Tooltip>
          </CircleMarker>
        )
      })}
    </>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/components/PhenomenaLayer.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/components/PhenomenaLayer.tsx src/components/PhenomenaLayer.test.tsx
git commit -m "Add PhenomenaLayer: renders phenomenon markers with placeholder text labels"
```

### Task 5: `PhenomenonPicker` + wiring into `SiteMapView`/`LayerPanel`

**Files:**
- Create: `src/components/PhenomenonPicker.tsx` + `.test.tsx`
- Modify: `src/components/LayerPanel.tsx` + `.test.tsx`
- Modify: `src/components/SiteMapView.tsx` + `.test.tsx`

`PhenomenonPicker` is a simple legend of 8 buttons (one per `PhenomenonKind`) plus a
"click the map to place" affordance, reusing the `PlacementMode` union from Task 1 —
add a `phenomenon` variant.

- [ ] **Step 1: Write failing tests for `PhenomenonPicker`**

```tsx
// src/components/PhenomenonPicker.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PhenomenonPicker } from './PhenomenonPicker'

describe('PhenomenonPicker', () => {
  it('calls onSelectKind with the clicked kind', () => {
    const onSelectKind = vi.fn()
    render(<PhenomenonPicker activeKind={null} onSelectKind={onSelectKind} />)

    fireEvent.click(screen.getByRole('button', { name: /spire.*vortex/i }))

    expect(onSelectKind).toHaveBeenCalledWith('spire-vortex')
  })

  it('shows which kind is currently active for placement', () => {
    render(<PhenomenonPicker activeKind="tube-magique" onSelectKind={vi.fn()} />)
    expect(screen.getByRole('button', { name: /tube.*magique/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking the active kind again deselects it (cancels placement mode)', () => {
    const onSelectKind = vi.fn()
    render(<PhenomenonPicker activeKind="point-cosmique" onSelectKind={onSelectKind} />)

    fireEvent.click(screen.getByRole('button', { name: /point.*cosmique/i }))

    expect(onSelectKind).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/components/PhenomenonPicker.test.tsx`
Expected: FAIL — `Cannot find module './PhenomenonPicker'`

- [ ] **Step 3: Implement `PhenomenonPicker`**

```tsx
// src/components/PhenomenonPicker.tsx
import type { PhenomenonKind } from '../domain/types'

export interface PhenomenonPickerProps {
  activeKind: PhenomenonKind | null
  onSelectKind: (kind: PhenomenonKind | null) => void
}

const KIND_OPTIONS: { kind: PhenomenonKind; label: string }[] = [
  { kind: 'cheminee-1', label: 'Cheminée 1 branche' },
  { kind: 'cheminee-2', label: 'Cheminée 2 branches' },
  { kind: 'cheminee-3', label: 'Cheminée 3 branches' },
  { kind: 'cheminee-4', label: 'Cheminée 4 branches' },
  { kind: 'spire-vortex', label: 'Spire de vortex' },
  { kind: 'point-cosmique', label: 'Point cosmique' },
  { kind: 'carre-magique', label: 'Carré magique' },
  { kind: 'tube-magique', label: 'Tube magique' },
]

export function PhenomenonPicker({ activeKind, onSelectKind }: PhenomenonPickerProps) {
  return (
    <div>
      {KIND_OPTIONS.map(({ kind, label }) => (
        <button
          key={kind}
          aria-pressed={activeKind === kind}
          onClick={() => onSelectKind(activeKind === kind ? null : kind)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/components/PhenomenonPicker.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/components/PhenomenonPicker.tsx src/components/PhenomenonPicker.test.tsx
git commit -m "Add PhenomenonPicker: legend of 8 phenomenon kinds with active-selection state"
```

- [ ] **Step 6: Add `phenomenon` to `PlacementMode`, wire the layer id, and integrate**

Re-read `src/components/SiteMapView.tsx` in full (Task 1 already changed it in this
same chunk) before editing.

```typescript
// src/components/LayerPanel.tsx — add alongside the other layer id constants
export const PHENOMENA_LAYER_ID = 'phenomena'
```

Add a checkbox (default hidden, `?? false`, same as Bagua/pathogenic-crossings — not
added to `DEFAULT_VISIBLE_LAYER_IDS`):

```tsx
      <label>
        <input
          type="checkbox"
          checked={visibility[PHENOMENA_LAYER_ID] ?? false}
          onChange={() => onToggle(PHENOMENA_LAYER_ID)}
        />
        Phénomènes ponctuels
      </label>
```

```typescript
// src/components/SiteMapView.tsx — extend the PlacementMode union from Task 1
type PlacementMode =
  | { kind: 'grid-origin' }
  | { kind: 'guide-line' }
  | { kind: 'phenomenon'; phenomenonKind: PhenomenonKind }
  | null
```

```typescript
// add state and imports
import { PhenomenonPicker } from './PhenomenonPicker'
import { PhenomenaLayer } from './PhenomenaLayer'
import { PHENOMENA_LAYER_ID } from './LayerPanel' // add to existing named import
import { createPhenomenon, listPhenomenaForPlan } from '../data/phenomenaRepo'
import type { Phenomenon, PhenomenonKind } from '../domain/types' // add to existing type import

const [phenomena, setPhenomena] = useState<Phenomenon[]>([])
```

Fetch phenomena in the existing load effect's `Promise.all` (alongside
`listFeltSegmentsForPlan`):

```typescript
        const [loadedInstances, loadedPoints, loadedTemplates, loadedSegments, loadedPhenomena] = await Promise.all([
          listGridInstancesForPlan(planId),
          listFeltPointsForPlan(planId),
          listGridTemplates(),
          listFeltSegmentsForPlan(planId),
          listPhenomenaForPlan(planId),
        ])
        // ... existing setInstances/setFeltPoints/setTemplates/setFeltSegments calls ...
        setPhenomena(loadedPhenomena)
```

Add a handler and extend `handleMapClick`:

```typescript
function handleSelectPhenomenonKind(kind: PhenomenonKind | null) {
  setPlacementMode(kind ? { kind: 'phenomenon', phenomenonKind: kind } : null)
}

async function handlePlacePhenomenon(local: Point, kind: PhenomenonKind) {
  try {
    const created = await createPhenomenon({ planId, kind, x: local.x, y: local.y })
    setPhenomena((prev) => [...prev, created])
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err))
  }
}
```

```typescript
// handleMapClick — add a third branch
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
    // Deliberately does NOT clear placementMode — placing several phenomena of the
    // same kind in a row (e.g. multiple telluric chimneys along a wall) shouldn't
    // require re-selecting the kind after every single click. Laurent explicitly
    // deselects via PhenomenonPicker (clicking the active kind again) or by
    // selecting a different kind.
  }
}
```

Render the layer and the picker:

```tsx
// inside <MapView>, alongside the other layers
<PhenomenaLayer phenomena={phenomena} missionOrigin={missionOrigin} visible={visibility[PHENOMENA_LAYER_ID] ?? false} />
```

```tsx
// in the top-left OverlayPanel, as a new stacked card (alongside the existing
// guide-line controls card and building-footprint card)
<div style={CARD_CHROME_STYLE}>
  <PhenomenonPicker
    activeKind={placementMode?.kind === 'phenomenon' ? placementMode.phenomenonKind : null}
    onSelectKind={handleSelectPhenomenonKind}
  />
</div>
```

- [ ] **Step 7: Write a failing integration test, then make it pass**

```tsx
// append to src/components/SiteMapView.test.tsx
vi.mock('./PhenomenaLayer', () => ({
  PhenomenaLayer: ({ visible, phenomena }: { visible: boolean; phenomena: unknown[] }) =>
    visible ? <div data-testid="phenomena-count">{phenomena.length}</div> : null,
}))

it('places a phenomenon on map click once a kind is selected', async () => {
  vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
  vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
  vi.mocked(phenomenaRepo.listPhenomenaForPlan).mockResolvedValue([])
  vi.mocked(phenomenaRepo.createPhenomenon).mockResolvedValue({
    id: 'ph1', planId: 'p1', kind: 'spire-vortex', x: 1, y: 1, createdAt: '2026-07-21T10:00:00Z',
  })

  render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

  fireEvent.click(await screen.findByRole('button', { name: /spire de vortex/i }))
  fireEvent.click(await screen.findByText('simulate-map-click'))

  await waitFor(() =>
    expect(phenomenaRepo.createPhenomenon).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'p1', kind: 'spire-vortex' })
    )
  )
  fireEvent.click(screen.getByLabelText(/phénomènes ponctuels/i))
  expect(await screen.findByTestId('phenomena-count')).toHaveTextContent('1')
})
```

Add the corresponding mock/import at the top of the test file:

```typescript
import * as phenomenaRepo from '../data/phenomenaRepo'
// ...
vi.mock('../data/phenomenaRepo')
// ... inside the shared beforeEach, add a default:
vi.mocked(phenomenaRepo.listPhenomenaForPlan).mockResolvedValue([])
```

Run: `node_modules/.bin/vitest.cmd run src/components/SiteMapView.test.tsx`
Expected: FAIL first (nothing wired), then PASS once Step 6 lands.

- [ ] **Step 8: Run the full suite, type-check, and commit**

Run: `node_modules/.bin/vitest.cmd run && node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/components/LayerPanel.tsx src/components/LayerPanel.test.tsx src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx
git commit -m "Wire PhenomenonPicker + PhenomenaLayer into SiteMapView's placement-mode and layer panel"
```

**Chunk 1 exit criteria:** full suite green, `tsc -b --noEmit` clean. From the map
screen, Laurent can select a phenomenon kind, click the map repeatedly to place several,
and toggle "Phénomènes ponctuels" to show/hide them — all through the same
single-active-placement-mode mechanism as grid-origin and guide-line placement.

---

## Chunk 2: Tracé libre eau/faille (Component A)

**Depends on Chunk 1's `PlacementMode` union.** Do not start until Chunk 1 is committed.

### Task 6: `polylineSimplify` — pure point-reduction function

**Files:**
- Create: `src/geometry/polylineSimplify.ts`
- Test: `src/geometry/polylineSimplify.test.ts`

Freehand capture accumulates one point per `mousemove` event — potentially hundreds for
a few seconds of dragging. Spec §2 allows either Douglas-Peucker or a minimum-distance
threshold; this plan uses the minimum-distance threshold (simpler to implement and test
correctly, sufficient for the stated goal of "avoid an excessive point count" — YAGNI
over Douglas-Peucker's added complexity for a need this modest).

- [ ] **Step 1: Write failing tests**

```typescript
// src/geometry/polylineSimplify.test.ts
import { describe, it, expect } from 'vitest'
import { simplifyByMinDistance } from './polylineSimplify'

describe('simplifyByMinDistance', () => {
  it('keeps the first and last point always', () => {
    const points = [{ x: 0, y: 0 }, { x: 0.001, y: 0 }, { x: 10, y: 10 }]
    const result = simplifyByMinDistance(points, 1)
    expect(result[0]).toEqual({ x: 0, y: 0 })
    expect(result[result.length - 1]).toEqual({ x: 10, y: 10 })
  })

  it('drops points closer than the threshold to the last kept point', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0.1, y: 0 }, // 0.1m from last kept point — dropped (threshold 0.5)
      { x: 0.2, y: 0 }, // 0.2m from last kept point (still x:0,y:0) — dropped
      { x: 1, y: 0 },   // 1m from last kept point — kept
    ]
    const result = simplifyByMinDistance(points, 0.5)
    expect(result).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }])
  })

  it('returns the input unchanged when it has 2 or fewer points', () => {
    expect(simplifyByMinDistance([], 0.5)).toEqual([])
    expect(simplifyByMinDistance([{ x: 0, y: 0 }], 0.5)).toEqual([{ x: 0, y: 0 }])
  })

  it('keeps every point when they are all farther apart than the threshold', () => {
    const points = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }]
    expect(simplifyByMinDistance(points, 0.5)).toEqual(points)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/geometry/polylineSimplify.test.ts`
Expected: FAIL — `Cannot find module './polylineSimplify'`

- [ ] **Step 3: Implement `simplifyByMinDistance`**

```typescript
// src/geometry/polylineSimplify.ts
import type { Point } from '../domain/types'

/**
 * Reduces a dense freehand-captured polyline (one point per pointer-move
 * event) to a sparser one: a point is kept only if it's at least
 * `minDistanceM` away from the last KEPT point (not the last raw point) —
 * this is what actually bounds the total point count for a long, slow
 * gesture, unlike comparing only to the immediately preceding raw point.
 * The first and last points are always kept so the traced line's real
 * start/end aren't altered.
 */
export function simplifyByMinDistance(points: Point[], minDistanceM: number): Point[] {
  if (points.length <= 2) return points

  const result: Point[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const last = result[result.length - 1]
    const dist = Math.hypot(points[i].x - last.x, points[i].y - last.y)
    if (dist >= minDistanceM) result.push(points[i])
  }
  result.push(points[points.length - 1])
  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/geometry/polylineSimplify.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/geometry/polylineSimplify.ts src/geometry/polylineSimplify.test.ts
git commit -m "Add simplifyByMinDistance: reduce dense freehand-captured points to a sparser polyline"
```

### Task 7: Widen `freeform_network` + `FreeformNetwork` type

**Files:**
- Create: `supabase/migrations/0017_freeform_network_metadata.sql`
- Modify: `src/domain/types.ts`

**Checkpoint humain:** write and commit the migration; do not apply to remote without
explicit go-ahead.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0017_freeform_network_metadata.sql
alter table freeform_network
  add column current_bearing_deg double precision,
  add column depth_m double precision,
  add column flow_rate text;
```

(All 3 nullable — spec §5: a trace can be placed before Laurent has measured its
detail, and metadata is often completed "after the fact" back home. `double precision`
for the angle/depth columns, matching every other geometry/measurement column in this
schema — `numeric` is reserved for the unrelated 0-10/Bovis sliders.)

- [ ] **Step 2: Widen the `FreeformNetwork` type**

```typescript
// src/domain/types.ts — replace the existing FreeformNetwork interface
export interface FreeformNetwork {
  id: string
  planId: string
  kind: FreeformNetworkKind
  points: Point[]
  currentBearingDeg: number | null
  depthM: number | null
  flowRate: string | null
  createdAt: string
}
```

(`createdAt` is added here too — spec §4A flags this as a pre-existing inconsistency
unrelated to this sub-project: `freeform_network` has had a `created_at` column since
`0001_plan1_schema.sql`, but the TS type never exposed it. Fixed here alongside the
other widening since both require touching the same interface and mapper.)

- [ ] **Step 3: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: clean (no repo/consumer reads this type's new fields yet)

```bash
git add supabase/migrations/0017_freeform_network_metadata.sql src/domain/types.ts
git commit -m "Widen freeform_network: add current_bearing_deg/depth_m/flow_rate, expose created_at"
```

### Task 8: `freeformNetworksRepo.ts`

**Files:**
- Create: `src/data/freeformNetworksRepo.ts`
- Test: `src/data/freeformNetworksRepo.test.ts`

Structural mirror of `feltPointsRepo.ts`, with `points` stored as `jsonb` (matching the
existing `freeform_network.points` column type — unlike `felt_segment`'s flattened
`ax/ay/bx/by`, this table already stores an arbitrary-length point array as JSON, so the
mapper passes it through directly rather than flattening/unflattening fixed fields).

- [ ] **Step 1: Write failing tests**

```typescript
// src/data/freeformNetworksRepo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFreeformNetwork, listFreeformNetworksForPlan } from './freeformNetworksRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('freeformNetworksRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a freeform network with metadata', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'fn1', plan_id: 'p1', kind: 'eau',
        points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        current_bearing_deg: 45, depth_m: 2.5, flow_rate: 'faible',
        created_at: '2026-07-21T10:00:00Z',
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const network = await createFreeformNetwork({
      planId: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      currentBearingDeg: 45, depthM: 2.5, flowRate: 'faible',
    })

    expect(from).toHaveBeenCalledWith('freeform_network')
    expect(chain.insert).toHaveBeenCalledWith({
      plan_id: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      current_bearing_deg: 45, depth_m: 2.5, flow_rate: 'faible',
    })
    expect(network.currentBearingDeg).toBe(45)
    expect(network.points).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }])
  })

  it('creates a freeform network with all metadata fields null', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'fn1', plan_id: 'p1', kind: 'faille', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        current_bearing_deg: null, depth_m: null, flow_rate: null,
        created_at: '2026-07-21T10:00:00Z',
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const network = await createFreeformNetwork({
      planId: 'p1', kind: 'faille', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      currentBearingDeg: null, depthM: null, flowRate: null,
    })

    expect(chain.insert).toHaveBeenCalledWith({
      plan_id: 'p1', kind: 'faille', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      current_bearing_deg: null, depth_m: null, flow_rate: null,
    })
    expect(network.depthM).toBeNull()
  })

  it('throws a descriptive French error when creation fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(
      createFreeformNetwork({ planId: 'p1', kind: 'eau', points: [], currentBearingDeg: null, depthM: null, flowRate: null })
    ).rejects.toThrow("Impossible d'enregistrer le tracé : network down")
  })

  it('lists freeform networks scoped to a plan', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [{
        id: 'fn1', plan_id: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }],
        current_bearing_deg: null, depth_m: null, flow_rate: null, created_at: '2026-07-21T10:00:00Z',
      }],
      error: null,
    })
    vi.mocked(supabase).from = from

    const networks = await listFreeformNetworksForPlan('p1')

    expect(chain.eq).toHaveBeenCalledWith('plan_id', 'p1')
    expect(networks).toHaveLength(1)
    expect(networks[0].kind).toBe('eau')
  })

  it('throws a descriptive French error when listing fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(listFreeformNetworksForPlan('p1')).rejects.toThrow(
      'Impossible de charger les tracés : network down'
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/data/freeformNetworksRepo.test.ts`
Expected: FAIL — `Cannot find module './freeformNetworksRepo'`

- [ ] **Step 3: Implement `freeformNetworksRepo.ts`**

```typescript
// src/data/freeformNetworksRepo.ts
import { supabase } from '../lib/supabaseClient'
import type { FreeformNetwork, FreeformNetworkKind, Point } from '../domain/types'

export interface CreateFreeformNetworkInput {
  planId: string
  kind: FreeformNetworkKind
  points: Point[]
  currentBearingDeg: number | null
  depthM: number | null
  flowRate: string | null
}

interface FreeformNetworkRow {
  id: string
  plan_id: string
  kind: FreeformNetworkKind
  points: Point[]
  current_bearing_deg: number | null
  depth_m: number | null
  flow_rate: string | null
  created_at: string
}

function mapRowToFreeformNetwork(row: FreeformNetworkRow): FreeformNetwork {
  return {
    id: row.id,
    planId: row.plan_id,
    kind: row.kind,
    points: row.points,
    currentBearingDeg: row.current_bearing_deg,
    depthM: row.depth_m,
    flowRate: row.flow_rate,
    createdAt: row.created_at,
  }
}

export async function createFreeformNetwork(input: CreateFreeformNetworkInput): Promise<FreeformNetwork> {
  const { data, error } = await supabase
    .from('freeform_network')
    .insert({
      plan_id: input.planId,
      kind: input.kind,
      points: input.points,
      current_bearing_deg: input.currentBearingDeg,
      depth_m: input.depthM,
      flow_rate: input.flowRate,
    })
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer le tracé : ${error.message}`)
  return mapRowToFreeformNetwork(data as FreeformNetworkRow)
}

export async function listFreeformNetworksForPlan(planId: string): Promise<FreeformNetwork[]> {
  const { data, error } = await supabase.from('freeform_network').select().eq('plan_id', planId)
  if (error) throw new Error(`Impossible de charger les tracés : ${error.message}`)
  return (data as FreeformNetworkRow[]).map(mapRowToFreeformNetwork)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/data/freeformNetworksRepo.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/freeformNetworksRepo.ts src/data/freeformNetworksRepo.test.ts
git commit -m "Add freeformNetworksRepo: CRUD for freeform_network with current/depth/flow metadata"
```

### Task 9: `FreeformNetworkLayer` — Leaflet rendering

**Files:**
- Create: `src/components/FreeformNetworkLayer.tsx`
- Test: `src/components/FreeformNetworkLayer.test.tsx`

Same family as `NetworkLinesLayer` (spec §4A) — a `Polyline` per network, colored by
`kind`. Blue for `eau` (confirmed by spec §3); brown for `faille` (matching the
`Failles` free-standing network color already chosen in `src/domain/networkColors.ts`'s
`NON_GRID_NETWORK_COLORS` for visual consistency with that other sub-project, even
though these are structurally different tables/features — same visual vocabulary for
the same French word "Failles").

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/FreeformNetworkLayer.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { FreeformNetworkLayer } from './FreeformNetworkLayer'
import type { FreeformNetwork } from '../domain/types'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const networks: FreeformNetwork[] = [
  { id: 'fn1', planId: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], currentBearingDeg: null, depthM: null, flowRate: null, createdAt: '2026-07-21T10:00:00Z' },
  { id: 'fn2', planId: 'p1', kind: 'faille', points: [{ x: -1, y: -1 }, { x: 2, y: 2 }], currentBearingDeg: null, depthM: null, flowRate: null, createdAt: '2026-07-21T10:01:00Z' },
]

describe('FreeformNetworkLayer', () => {
  it('renders one polyline per network, colored by kind', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FreeformNetworkLayer networks={networks} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    const lines = container.querySelectorAll('path.leaflet-interactive')
    expect(lines).toHaveLength(2)
    expect(lines[0].getAttribute('stroke')).toBe('#00acc1')
    expect(lines[1].getAttribute('stroke')).toBe('#795548')
  })

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FreeformNetworkLayer networks={networks} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })

  it('renders nothing when there are no networks', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FreeformNetworkLayer networks={[]} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })
})
```

**Note on the color values:** `#00acc1` (Eau) and `#795548` (Failles) are the exact
hex values already established in `src/domain/networkColors.ts`'s
`NON_GRID_NETWORK_COLORS` for the pathogenic-crossings-adjacent Eau/Failles categories
— reusing them here keeps one color per French word "Eau"/"Failles" across the whole
app rather than inventing a second blue/brown. Import the constant rather than
re-declaring the hex values as a new literal (see Step 3).

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/components/FreeformNetworkLayer.test.tsx`
Expected: FAIL — `Cannot find module './FreeformNetworkLayer'`

- [ ] **Step 3: Implement `FreeformNetworkLayer`**

```tsx
// src/components/FreeformNetworkLayer.tsx
import { Polyline } from 'react-leaflet'
import type { FreeformNetwork } from '../domain/types'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import { NON_GRID_NETWORK_COLORS } from '../domain/networkColors'

export interface FreeformNetworkLayerProps {
  networks: FreeformNetwork[]
  missionOrigin: LatLng
  visible: boolean
}

function colorForKind(kind: FreeformNetwork['kind']): string {
  return kind === 'eau' ? NON_GRID_NETWORK_COLORS.Eau : NON_GRID_NETWORK_COLORS.Failles
}

export function FreeformNetworkLayer({ networks, missionOrigin, visible }: FreeformNetworkLayerProps) {
  if (!visible) return null

  return (
    <>
      {networks.map((network) => (
        <Polyline
          key={network.id}
          positions={network.points.map((p) => {
            const latlng = localToLatLng(p, missionOrigin)
            return [latlng.lat, latlng.lng] as [number, number]
          })}
          pathOptions={{ color: colorForKind(network.kind), weight: 3 }}
        />
      ))}
    </>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/components/FreeformNetworkLayer.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/components/FreeformNetworkLayer.tsx src/components/FreeformNetworkLayer.test.tsx
git commit -m "Add FreeformNetworkLayer: renders eau/faille polylines, reusing NON_GRID_NETWORK_COLORS"
```

### Task 10: `FreeformMetadataForm` — post-trace metadata capture

**Files:**
- Create: `src/components/FreeformMetadataForm.tsx` + `.test.tsx`

A small form shown once a trace is captured, before it's saved: current bearing
(degrees, spec §3 — "hypothèse : angle simple", all fields optional per spec §5),
depth (meters), flow rate (free text, spec §3's stated preference over a fixed scale).

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/FreeformMetadataForm.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FreeformMetadataForm } from './FreeformMetadataForm'

describe('FreeformMetadataForm', () => {
  it('submits with all fields filled', () => {
    const onSubmit = vi.fn()
    render(<FreeformMetadataForm onSubmit={onSubmit} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/sens du courant/i), { target: { value: '45' } })
    fireEvent.change(screen.getByLabelText(/profondeur/i), { target: { value: '2.5' } })
    fireEvent.change(screen.getByLabelText(/débit/i), { target: { value: 'faible' } })
    fireEvent.click(screen.getByRole('button', { name: /valider/i }))

    expect(onSubmit).toHaveBeenCalledWith({ currentBearingDeg: 45, depthM: 2.5, flowRate: 'faible' })
  })

  it('submits with all fields left empty as null (spec §5 — all optional)', () => {
    const onSubmit = vi.fn()
    render(<FreeformMetadataForm onSubmit={onSubmit} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /valider/i }))

    expect(onSubmit).toHaveBeenCalledWith({ currentBearingDeg: null, depthM: null, flowRate: null })
  })

  it('calls onCancel without submitting', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(<FreeformMetadataForm onSubmit={onSubmit} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: /annuler/i }))

    expect(onCancel).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/components/FreeformMetadataForm.test.tsx`
Expected: FAIL — `Cannot find module './FreeformMetadataForm'`

- [ ] **Step 3: Implement `FreeformMetadataForm`**

```tsx
// src/components/FreeformMetadataForm.tsx
import { useState } from 'react'

export interface FreeformMetadata {
  currentBearingDeg: number | null
  depthM: number | null
  flowRate: string | null
}

export interface FreeformMetadataFormProps {
  onSubmit: (metadata: FreeformMetadata) => void
  onCancel: () => void
}

export function FreeformMetadataForm({ onSubmit, onCancel }: FreeformMetadataFormProps) {
  const [bearingInput, setBearingInput] = useState('')
  const [depthInput, setDepthInput] = useState('')
  const [flowRate, setFlowRate] = useState('')

  function handleSubmit() {
    onSubmit({
      currentBearingDeg: bearingInput.trim() === '' ? null : Number(bearingInput),
      depthM: depthInput.trim() === '' ? null : Number(depthInput),
      flowRate: flowRate.trim() === '' ? null : flowRate,
    })
  }

  return (
    <div>
      <label>
        Sens du courant (degrés)
        <input type="number" value={bearingInput} onChange={(e) => setBearingInput(e.target.value)} />
      </label>
      <label>
        Profondeur (m)
        <input type="number" step="0.1" value={depthInput} onChange={(e) => setDepthInput(e.target.value)} />
      </label>
      <label>
        Débit
        <input type="text" value={flowRate} onChange={(e) => setFlowRate(e.target.value)} />
      </label>
      <button onClick={handleSubmit}>Valider</button>
      <button onClick={onCancel}>Annuler</button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/components/FreeformMetadataForm.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/components/FreeformMetadataForm.tsx src/components/FreeformMetadataForm.test.tsx
git commit -m "Add FreeformMetadataForm: current bearing/depth/flow rate, all fields optional"
```

### Task 11: `FreeformDrawTool` — freehand pointer capture

**Files:**
- Create: `src/components/FreeformDrawTool.tsx` + `.test.tsx`

**The core new mechanism — and the one genuine risk in this whole plan, caught in plan
review: mouse events alone do not work on touch devices.** Leaflet's map-level event
system (what `useMapEvents` taps into) binds the literal native `mousedown`/
`mousemove`/`mouseup` DOM events — verified by reading Leaflet's own source
(`Map.js`/`DomEvent.js`). Mobile/tablet browsers only synthesize a single
`mousedown`+`mouseup`(+`click`) pair at the END of a tap or drag; they do **not** fire
continuous synthetic `mousemove` events for a `touchmove` drag. A version of this
component built on `mousedown`/`mousemove`/`mouseup` alone would work perfectly in a
desktop browser (including simulated mouse-drag tests) while **silently capturing
nothing** on the real finger/stylus input this whole feature exists for (spec §2/§3A:
"Laurent trace au doigt/stylet"). This must listen for real `touchstart`/`touchmove`/
`touchend` too, not just mouse events — Leaflet doesn't merge these into its generic map
event API, so they need their own native listeners on the map's DOM container.

Rendered as a child of `<MapView>` (same pattern as `EditableNetworkLine.tsx` — a
component that calls `useMap()` directly, not routed through `MapView`'s single
`onMapClick` prop, since this needs continuous multi-event capture, not a single
click). Suspends map dragging during capture (`map.dragging.disable()`/`.enable()` — a
standard Leaflet primitive, not a Geoman dependency, confirmed present on Leaflet's
`Map.dragging: Handler` in the installed package's types) so panning the map doesn't
fight with drawing on it. `map.mouseEventToLatLng(ev)` (a real Leaflet API — confirmed
in `node_modules/leaflet/src/map/Map.js`) only reads `ev.clientX`/`ev.clientY`
internally, so it works identically for a `MouseEvent` or a `Touch` object at runtime;
its TypeScript signature is narrowly typed to `MouseEvent`, so a `Touch` needs an
explicit cast (`as unknown as MouseEvent`) at the call site — not a workaround for
missing functionality, just satisfying a type signature that's stricter than the
runtime implementation requires.

Per spec §6, this component gets only a smoke test (renders without crashing) — real
pointer-drag precision, on BOTH a mouse (desktop) and a real touch device (tablet/
phone — these are genuinely different code paths here, unlike most of this app's
click-based tools, so both must be checked separately in Task 12 Step 5's manual
verification, not treated as interchangeable), is validated manually, not in jsdom,
matching the existing precedent for `EditableNetworkLine.tsx`'s Geoman wiring.

- [ ] **Step 1: Write a failing smoke test**

```tsx
// src/components/FreeformDrawTool.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { FreeformDrawTool } from './FreeformDrawTool'

describe('FreeformDrawTool', () => {
  it('renders without crashing when active', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FreeformDrawTool active missionOrigin={{ lat: 48.8566, lng: 2.3522 }} onComplete={vi.fn()} />
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
        <FreeformDrawTool active={false} missionOrigin={{ lat: 48.8566, lng: 2.3522 }} onComplete={vi.fn()} />
      </MapContainer>
    )
    expect(container).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/components/FreeformDrawTool.test.tsx`
Expected: FAIL — `Cannot find module './FreeformDrawTool'`

- [ ] **Step 3: Implement `FreeformDrawTool`**

```tsx
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
 * desktop testing) and touch (touchstart/touchmove/touchend, for the real
 * field-use finger/stylus input) events, bound directly on the map's DOM
 * container via native addEventListener — NOT via react-leaflet's
 * useMapEvents, which only forwards Leaflet's own map-level event names and
 * does not merge touch gestures into them (verified against Leaflet's source:
 * a touchmove drag does not synthesize continuous mousemove events the way a
 * simple tap synthesizes one mousedown/mouseup/click pair). Suspends map
 * dragging for the duration of the gesture (map.dragging.disable/.enable) so
 * panning doesn't fight with drawing, and prevents the browser's default
 * touch behavior (page scroll/pinch-zoom) during a touch capture.
 */
export function FreeformDrawTool({ active, missionOrigin, onComplete }: FreeformDrawToolProps) {
  const map = useMap()
  const isDrawingRef = useRef(false)
  const capturedPointsRef = useRef<Point[]>([])

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
      map.dragging.enable()
      const simplified = simplifyByMinDistance(capturedPointsRef.current, MIN_DISTANCE_M)
      capturedPointsRef.current = []
      onComplete(simplified)
    }

    function onMouseDown(e: MouseEvent) {
      if (!active) return
      beginCapture(e)
    }
    function onMouseMove(e: MouseEvent) {
      continueCapture(e)
    }
    function onMouseUp() {
      endCapture()
    }

    function onTouchStart(e: TouchEvent) {
      if (!active || e.touches.length === 0) return
      beginCapture(e.touches[0])
    }
    function onTouchMove(e: TouchEvent) {
      if (!isDrawingRef.current || e.touches.length === 0) return
      // Prevent the page from scrolling/zooming while a trace is being drawn —
      // without this, the browser's default touch-scroll behavior fights with
      // the drag the moment the finger moves.
      e.preventDefault()
      continueCapture(e.touches[0])
    }
    function onTouchEnd() {
      endCapture()
    }

    container.addEventListener('mousedown', onMouseDown)
    container.addEventListener('mousemove', onMouseMove)
    container.addEventListener('mouseup', onMouseUp)
    // passive: false is required for touchmove's preventDefault() above to
    // actually take effect (browsers default touchmove listeners to passive).
    container.addEventListener('touchstart', onTouchStart)
    container.addEventListener('touchmove', onTouchMove, { passive: false })
    container.addEventListener('touchend', onTouchEnd)

    return () => {
      container.removeEventListener('mousedown', onMouseDown)
      container.removeEventListener('mousemove', onMouseMove)
      container.removeEventListener('mouseup', onMouseUp)
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
    }
  }, [map, active, missionOrigin, onComplete])

  return null
}
```

**Why native `addEventListener` on `map.getContainer()` rather than `useMapEvents`:**
`useMapEvents` only exposes Leaflet's own synthesized event names (`click`, `mousedown`,
etc., re-fired by Leaflet's internal dispatch) — it has no `touchstart`/`touchmove`/
`touchend` entries at all, because Leaflet's own touch handling (`Draggable.js`) is
internal to its dragging/zooming handlers, not exposed as generic map events. Binding
directly to the container's real DOM node with native listeners is the only way to
observe raw touch events GEOBIO doesn't already have a purpose-built hook for.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/components/FreeformDrawTool.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/components/FreeformDrawTool.tsx src/components/FreeformDrawTool.test.tsx
git commit -m "Add FreeformDrawTool: GEOBIO-owned freehand pointer capture, no Geoman dependency"
```

### Task 12: Wire freeform tracing into `SiteMapView`/`LayerPanel`

**Files:**
- Modify: `src/components/LayerPanel.tsx` + `.test.tsx`
- Modify: `src/components/SiteMapView.tsx` + `.test.tsx`

Re-read `src/components/SiteMapView.tsx` in full before editing — Chunk 1 already
changed it substantially (`PlacementMode` union, `PhenomenonPicker`/`PhenomenaLayer`
wiring).

- [ ] **Step 1: Add the layer id and checkbox**

```typescript
// src/components/LayerPanel.tsx
export const FREEFORM_NETWORK_LAYER_ID = 'freeform-network'
```

```tsx
      <label>
        <input
          type="checkbox"
          checked={visibility[FREEFORM_NETWORK_LAYER_ID] ?? false}
          onChange={() => onToggle(FREEFORM_NETWORK_LAYER_ID)}
        />
        Tracés eau/faille
      </label>
```

- [ ] **Step 2: Extend `PlacementMode`, add state, wire the draw tool + metadata form**

```typescript
// src/components/SiteMapView.tsx — extend the union from Chunk 1
type PlacementMode =
  | { kind: 'grid-origin' }
  | { kind: 'guide-line' }
  | { kind: 'phenomenon'; phenomenonKind: PhenomenonKind }
  | { kind: 'freeform'; freeformKind: FreeformNetworkKind }
  | null
```

```typescript
// imports
import { FreeformDrawTool } from './FreeformDrawTool'
import { FreeformNetworkLayer } from './FreeformNetworkLayer'
import { FreeformMetadataForm, type FreeformMetadata } from './FreeformMetadataForm'
import { FREEFORM_NETWORK_LAYER_ID } from './LayerPanel' // add to existing import
import { createFreeformNetwork, listFreeformNetworksForPlan } from '../data/freeformNetworksRepo'
import type { FreeformNetwork, FreeformNetworkKind } from '../domain/types' // add to existing import

const [freeformNetworks, setFreeformNetworks] = useState<FreeformNetwork[]>([])
// Holds the captured (not-yet-saved) points between FreeformDrawTool.onComplete
// and the metadata form being submitted/cancelled — null means no pending trace.
const [pendingFreeformTrace, setPendingFreeformTrace] = useState<{ kind: FreeformNetworkKind; points: Point[] } | null>(null)
```

Fetch in the load effect's `Promise.all` (alongside `listPhenomenaForPlan` from Chunk 1):

```typescript
        const [loadedInstances, loadedPoints, loadedTemplates, loadedSegments, loadedPhenomena, loadedFreeform] = await Promise.all([
          listGridInstancesForPlan(planId),
          listFeltPointsForPlan(planId),
          listGridTemplates(),
          listFeltSegmentsForPlan(planId),
          listPhenomenaForPlan(planId),
          listFreeformNetworksForPlan(planId),
        ])
        // ... existing setters ...
        setFreeformNetworks(loadedFreeform)
```

Add handlers:

```typescript
function handleStartFreeformTrace(kind: FreeformNetworkKind) {
  setPlacementMode({ kind: 'freeform', freeformKind: kind })
}

function handleFreeformTraceComplete(points: Point[]) {
  if (placementMode?.kind !== 'freeform') return
  // Capture is done — hand off to the metadata form rather than saving
  // immediately (spec §3A step 3). placementMode stays 'freeform' so
  // FreeformDrawTool.active goes false (draw finished) while the map still
  // knows a freeform flow is in progress, until the form is submitted/cancelled.
  setPendingFreeformTrace({ kind: placementMode.freeformKind, points })
}

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
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err))
  } finally {
    setPendingFreeformTrace(null)
    setPlacementMode(null)
  }
}

function handleCancelFreeformMetadata() {
  // Spec §5: a cancelled trace must leave no orphaned FreeformNetwork — since
  // nothing was persisted yet at this point (creation only happens on submit),
  // simply discarding the pending state is enough, no delete call needed.
  setPendingFreeformTrace(null)
  setPlacementMode(null)
}
```

Render the draw tool (always mounted inside `<MapView>`, only actually capturing when
`active` is true — matching `EditableNetworkLine`'s own "always rendered, `editable`
prop gates behavior" pattern rather than conditionally mounting/unmounting):

```tsx
// inside <MapView>, alongside the other layers
<FreeformDrawTool
  active={placementMode?.kind === 'freeform' && pendingFreeformTrace === null}
  missionOrigin={missionOrigin}
  onComplete={handleFreeformTraceComplete}
/>
<FreeformNetworkLayer
  networks={freeformNetworks}
  missionOrigin={missionOrigin}
  visible={visibility[FREEFORM_NETWORK_LAYER_ID] ?? false}
/>
```

Add trace-start buttons (top-left, alongside the `PhenomenonPicker` card from Chunk 1)
and the metadata form (shown only while `pendingFreeformTrace` is set):

```tsx
<div style={CARD_CHROME_STYLE}>
  <button onClick={() => handleStartFreeformTrace('eau')} disabled={placementMode !== null}>
    Tracer l'eau
  </button>
  <button onClick={() => handleStartFreeformTrace('faille')} disabled={placementMode !== null}>
    Tracer une faille
  </button>
</div>
{pendingFreeformTrace && (
  <div style={CARD_CHROME_STYLE}>
    <FreeformMetadataForm onSubmit={handleSubmitFreeformMetadata} onCancel={handleCancelFreeformMetadata} />
  </div>
)}
```

- [ ] **Step 3: Write a failing integration test, then make it pass**

```tsx
// append to src/components/SiteMapView.test.tsx
vi.mock('./FreeformDrawTool', () => ({
  FreeformDrawTool: ({ active, onComplete }: { active: boolean; onComplete: (points: unknown[]) => void }) =>
    active ? <button onClick={() => onComplete([{ x: 0, y: 0 }, { x: 1, y: 1 }])}>simulate-freeform-complete</button> : null,
}))
vi.mock('./FreeformNetworkLayer', () => ({
  FreeformNetworkLayer: ({ visible, networks }: { visible: boolean; networks: unknown[] }) =>
    visible ? <div data-testid="freeform-count">{networks.length}</div> : null,
}))

it('captures a freeform trace, submits metadata, and saves it', async () => {
  vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
  vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
  vi.mocked(phenomenaRepo.listPhenomenaForPlan).mockResolvedValue([])
  vi.mocked(freeformNetworksRepo.listFreeformNetworksForPlan).mockResolvedValue([])
  vi.mocked(freeformNetworksRepo.createFreeformNetwork).mockResolvedValue({
    id: 'fn1', planId: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    currentBearingDeg: null, depthM: null, flowRate: null, createdAt: '2026-07-21T10:00:00Z',
  })

  render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

  fireEvent.click(await screen.findByRole('button', { name: /tracer l'eau/i }))
  fireEvent.click(await screen.findByText('simulate-freeform-complete'))
  fireEvent.click(await screen.findByRole('button', { name: /valider/i })) // all fields left blank

  await waitFor(() =>
    expect(freeformNetworksRepo.createFreeformNetwork).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })
    )
  )
  fireEvent.click(screen.getByLabelText(/tracés eau\/faille/i))
  expect(await screen.findByTestId('freeform-count')).toHaveTextContent('1')
})
```

Add the mock/import at the top of the test file:

```typescript
import * as freeformNetworksRepo from '../data/freeformNetworksRepo'
// ...
vi.mock('../data/freeformNetworksRepo')
// ... inside the shared beforeEach:
vi.mocked(freeformNetworksRepo.listFreeformNetworksForPlan).mockResolvedValue([])
```

Run: `node_modules/.bin/vitest.cmd run src/components/SiteMapView.test.tsx`
Expected: FAIL first, then PASS once Step 2 lands.

- [ ] **Step 4: Run the full suite and type-check**

Run: `node_modules/.bin/vitest.cmd run && node_modules/.bin/tsc.cmd -b --noEmit`
Expected: all pass, clean, no regression in prior test counts

- [ ] **Step 5: Manually verify in the browser — mouse AND touch separately**

Run: `npm run dev`. **These are two genuinely different code paths (Task 11) — verify
both, don't treat one as a stand-in for the other:**

1. **Desktop mouse:** click "Tracer l'eau", click-and-drag a curved line on the map with
   the mouse, release, fill (or skip) the metadata form, validate. Expected: a blue
   polyline appears matching the dragged path; map panning is suspended during the drag
   and resumes after.
2. **Real touch device (phone/tablet, not a desktop browser's touch emulation mode,
   which simulates touch geometry but still delivers input through the same
   mouse-event pipeline as a real mouse — the point of this check is to exercise the
   actual `touchstart`/`touchmove`/`touchend` listeners):** same flow, but drag with a
   finger or stylus. Expected: the same result — a continuous traced polyline, not a
   single point or a straight line between start/end (which is what you'd see if the
   touch listeners weren't actually firing/capturing intermediate points). Also confirm
   the page itself doesn't scroll/bounce while tracing (the `touchmove` handler's
   `preventDefault()` should stop that).

This is the one piece of this plan that automated tests cannot substitute for (spec
§6) — flag any rough edges in the capture feel (simplification threshold too
aggressive/not aggressive enough, touch capture feeling laggy or dropping the start of
a stroke) back to Laurent rather than silently tuning `MIN_DISTANCE_M` or the event
wiring.

- [ ] **Step 6: Commit**

```bash
git add src/components/LayerPanel.tsx src/components/LayerPanel.test.tsx src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx
git commit -m "Wire FreeformDrawTool + FreeformMetadataForm + FreeformNetworkLayer into SiteMapView"
```

**Chunk 2 / plan exit criteria:** full suite green, `tsc -b --noEmit` clean. Laurent can
click "Tracer l'eau"/"Tracer une faille", drag a freehand line on the map (map panning
suspended during the gesture), fill in optional current/depth/flow metadata (or skip
all of it), and see the saved trace rendered in blue/brown on a toggleable layer —
built entirely with GEOBIO's own code, no Geoman dependency for this component.

## Explicitly out of scope (spec §7, unchanged)

- Real icons for the phenomenon legend — placeholder text codes stand in until Laurent
  supplies the real icon sheet.
- Faille color convention — this plan reuses the `Failles` color already picked for the
  unrelated pathogenic-crossings sub-project's non-grid category, as a pragmatic default;
  flag to Laurent as a decision made here, not a pre-existing confirmed convention.
- Editing or deleting a placed freeform trace after saving — not requested (deleting a
  phenomenon IS included, per spec §4B's revision).
- Wiring these two data sources into the pathogenic-crossings aggravation logic — that's
  described as a future extension point in the pathogenic-crossings spec itself, not
  this plan.
- A delete-UI for phenomena — the repo function exists (Task 3) but no map/list UI calls
  it in this plan, matching the existing `deleteFeltPoint` precedent (repo capability
  without a caller).
