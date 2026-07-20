# Felt Segment + Network Color Resolution Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if
> subagents available) or superpowers:executing-plans to implement this plan. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix network-color resolution so felt points/segments are colored correctly
even without a generated grid on the plan, and add a `FeltSegment` concept so a rod's
two ArUco markers (detected together) produce one oriented line instead of two
disconnected points.

**Architecture:** Chunk 1 fixes `colorForNetwork` by extracting a pure, 4-step
resolution function (`resolveNetworkColor`) that falls through active `GridInstance` →
`GridTemplate` → a small free-standing color table → grey. Chunk 2 adds a new
`felt_segment` table/repo/domain type, a pairing step in `arucoMapping.ts` (dedup by
marker ID, then group by `networkName`+`rodNumber`), a new `FeltSegmentsLayer`
presentational component, and wires both into `RodDetectionPanel`, `LayerPanel`, and
`SiteMapView` following the exact patterns already used for `FeltPoint`/`FeltPointsLayer`.

**Tech Stack:** Vite, React, TypeScript, react-leaflet, Supabase, Vitest + Testing
Library. One new migration, one new table, no other new dependency.

**Spec:** `docs/superpowers/specs/2026-07-20-felt-segment-and-network-color-design.md` —
read this first for full rationale. Approved by Laurent + spec-document-reviewer
(2026-07-20).

**Worktree:** `D:\LAURENT PC\GEOBIO\.worktrees\plan1-moteur-reseaux`, branch
`plan1-moteur-reseaux` (183 tests green as of this plan's writing — Plan 1, Bagua, and
rod-marker/ArUco detection all already implemented). Node/npm may not be on PATH
directly in Bash — use `node_modules/.bin/vitest.cmd` / `node_modules/.bin/tsc.cmd`, or
use PowerShell where Node is already on PATH.

---

## Chunk 1: Network color resolution

**Why this is its own chunk:** it's a complete, independently valuable fix — felt points
immediately render with correct network colors even before any `FeltSegment` code
exists — and touches a different, smaller set of files than Chunk 2.

### Task 1: `resolveNetworkColor` — pure 4-step color resolution

**Files:**
- Create: `src/domain/networkColors.ts`
- Test: `src/domain/networkColors.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/domain/networkColors.test.ts
import { describe, it, expect } from 'vitest'
import { resolveNetworkColor, NON_GRID_NETWORK_COLORS } from './networkColors'
import type { GridInstance, GridTemplate } from './types'

function makeTemplate(name: string, color: string): GridTemplate {
  return {
    id: `t-${name}`, name, spacingXM: 1, spacingYM: 1, angleTrueNorthDeg: 0,
    originOffsetX: 0, originOffsetY: 0, color, vibratoryBase: 7,
  }
}

function makeInstance(name: string, color: string): GridInstance {
  return { id: `gi-${name}`, planId: 'p1', templateSnapshot: makeTemplate(name, color), originX: 0, originY: 0 }
}

describe('resolveNetworkColor', () => {
  it('prefers an active GridInstance color over the GridTemplate color', () => {
    const instances = [makeInstance('Hartmann', '#custom-override')]
    const templates = [makeTemplate('Hartmann', '#d32f2f')]
    expect(resolveNetworkColor('Hartmann', instances, templates)).toBe('#custom-override')
  })

  it('falls back to the GridTemplate color when no instance is active on this plan', () => {
    const templates = [makeTemplate('Peyré', '#8e5fb3')]
    expect(resolveNetworkColor('Peyré', [], templates)).toBe('#8e5fb3')
  })

  it('falls back to the free-standing table for non-grid categories', () => {
    expect(resolveNetworkColor('Eau', [], [])).toBe(NON_GRID_NETWORK_COLORS.Eau)
    expect(resolveNetworkColor('Failles', [], [])).toBe(NON_GRID_NETWORK_COLORS.Failles)
  })

  it('falls back to grey for a genuinely unrecognized network name', () => {
    expect(resolveNetworkColor('Inconnu', [], [])).toBe('#888888')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/domain/networkColors.test.ts`
Expected: FAIL — `Cannot find module './networkColors'`

- [ ] **Step 3: Implement `resolveNetworkColor`**

```typescript
// src/domain/networkColors.ts
import type { GridInstance, GridTemplate } from './types'

/**
 * Colors for networks that have no GridTemplate because they aren't
 * theoretical-grid networks (freeform categories). A plain code-owned
 * constant, not a database table — see spec §2 step 3. Confirmed with
 * Laurent: cyan for Eau (distinct from Palm's steel blue #4a90c4), brown for
 * Failles (distinct from every other network/layer color in the app).
 */
export const NON_GRID_NETWORK_COLORS: Record<string, string> = {
  Eau: '#00acc1',
  Failles: '#795548',
}

const FALLBACK_COLOR = '#888888'

/**
 * 4-step resolution chain (spec §2): active GridInstance on this plan wins
 * (lets a per-mission override take effect if one is ever introduced), else
 * the network's GridTemplate (covers Hartmann/Curry/Palm/Peyré/Wissmann even
 * with no grid generated on this plan), else the free-standing table above
 * (non-grid categories), else grey.
 */
export function resolveNetworkColor(
  networkName: string,
  instances: GridInstance[],
  templates: GridTemplate[]
): string {
  const instanceMatch = instances.find((i) => i.templateSnapshot.name === networkName)
  if (instanceMatch) return instanceMatch.templateSnapshot.color

  const templateMatch = templates.find((t) => t.name === networkName)
  if (templateMatch) return templateMatch.color

  if (networkName in NON_GRID_NETWORK_COLORS) return NON_GRID_NETWORK_COLORS[networkName]

  return FALLBACK_COLOR
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/domain/networkColors.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/networkColors.ts src/domain/networkColors.test.ts
git commit -m "Add resolveNetworkColor: 4-step network color resolution (instance, template, free-standing table, grey)"
```

### Task 2: Wire `resolveNetworkColor` into `SiteMapView`

**Files:**
- Modify: `src/components/SiteMapView.tsx`
- Modify: `src/components/SiteMapView.test.tsx`

- [ ] **Step 1: Add the `gridTemplatesRepo` mock and a file-wide default**

`SiteMapView.test.tsx` follows an established pattern (see the existing comment above
`fetchBuildingsInBounds`'s default in the `beforeEach`, around line 100-111): every
repo call added to the component's load effect needs either an explicit
`mockResolvedValue` in each test, or — since ~13 existing tests don't care about this
new call — a single default in the shared `beforeEach`. Follow the second approach,
exactly like `fetchBuildingsInBounds` already does, rather than editing every test body.

Add near the top, alongside the other repo imports/mocks:

```typescript
// add to the import block
import * as gridTemplatesRepo from '../data/gridTemplatesRepo'
```

```typescript
// add alongside the other vi.mock(...) calls (after vi.mock('../data/feltPointsRepo'))
vi.mock('../data/gridTemplatesRepo')
```

```typescript
// inside the existing beforeEach (after the fetchBuildingsInBounds default), add:
vi.mocked(gridTemplatesRepo.listGridTemplates).mockResolvedValue([])
```

- [ ] **Step 2: Write a failing test for the template color fallback**

This exercises `resolveNetworkColor`'s wiring specifically (the resolution logic
itself is already fully covered by Task 1's unit tests — this just proves
`SiteMapView` actually fetches templates and passes them through). Add after the
existing "loads instances/lines/felt points..." test:

```tsx
  it('fetches grid templates alongside instances/lines/felt points', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(gridTemplatesRepo.listGridTemplates).mockResolvedValue([
      { id: 't-peyre', name: 'Peyré', spacingXM: 6.5, spacingYM: 7.25, angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0, color: '#8e5fb3', vibratoryBase: 7 },
    ])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    await waitFor(() => expect(gridTemplatesRepo.listGridTemplates).toHaveBeenCalled())
  })
```

- [ ] **Step 3: Run tests to verify the new test fails**

Run: `node_modules/.bin/vitest.cmd run src/components/SiteMapView.test.tsx`
Expected: FAIL — `listGridTemplates` never called (not wired yet)

- [ ] **Step 4: Fetch templates and wire `resolveNetworkColor`**

```typescript
// src/components/SiteMapView.tsx — add import
import { listGridTemplates } from '../data/gridTemplatesRepo'
import { resolveNetworkColor } from '../domain/networkColors'
```

```typescript
// add state, alongside the other useState calls (near feltPoints):
const [templates, setTemplates] = useState<GridTemplate[]>([])
```

Modify the existing load effect (`useEffect(() => { async function load() {...} load() }, [planId])`,
around line 168) to also fetch templates in parallel:

```typescript
  useEffect(() => {
    async function load() {
      try {
        const [loadedInstances, loadedPoints, loadedTemplates] = await Promise.all([
          listGridInstancesForPlan(planId),
          listFeltPointsForPlan(planId),
          listGridTemplates(),
        ])
        setInstances(loadedInstances)
        setFeltPoints(loadedPoints)
        setTemplates(loadedTemplates)
        const entries = await Promise.all(
          loadedInstances.map(
            async (instance) => [instance.id, await listGridLinesForInstance(instance.id)] as const
          )
        )
        setLinesByInstance(Object.fromEntries(entries))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
    load()
  }, [planId])
```

Replace `colorForNetwork`'s body (around line 363) to delegate to the pure function:

```typescript
  function colorForNetwork(networkName: string): string {
    return resolveNetworkColor(networkName, instances, templates)
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/components/SiteMapView.test.tsx`
Expected: PASS (all tests, including the new one) — the `beforeEach` default from Step
1 keeps every pre-existing test unaffected.

- [ ] **Step 6: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx
git commit -m "Wire resolveNetworkColor into SiteMapView: fetch grid templates, delegate colorForNetwork"
```

---

## Chunk 2: `FeltSegment` — rod orientation from paired ArUco markers

### Task 3: Migration — `felt_segment` table

**Files:**
- Create: `supabase/migrations/0015_felt_segment.sql`

**Checkpoint humain:** as with every migration this session, this file is written here
but NOT applied to the remote database automatically — apply it the same way Laurent
has each time so far (explicit go-ahead, then `supabase db push` or `supabase db query
--linked --file ...`, via PowerShell if Bash's classifier blocks it). Re-verify `0015`
is still the next free number immediately before applying — `ls supabase/migrations`
— in case another sub-project claimed it first (this has happened before: Bagua took
`0012` out from under the rod-marker plan's original guess).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0015_felt_segment.sql
create table felt_segment (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plan(id) on delete cascade,
  network_name text not null,
  ax double precision not null,
  ay double precision not null,
  bx double precision not null,
  by double precision not null,
  created_at timestamptz not null default now()
);
create index felt_segment_plan_id_idx on felt_segment(plan_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0015_felt_segment.sql
git commit -m "Add felt_segment table migration"
```

(Apply to remote only after explicit confirmation from Laurent, per this session's
established pattern — not part of this checkbox.)

### Task 4: `FeltSegment` domain type

**Files:**
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Add the type**

Add after `FeltPoint` (around line 119):

```typescript
export interface FeltSegment {
  id: string
  planId: string
  networkName: string
  pointA: Point
  pointB: Point
  createdAt: string
}
```

- [ ] **Step 2: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: no new errors (nothing consumes `FeltSegment` yet)

```bash
git add src/domain/types.ts
git commit -m "Add FeltSegment domain type"
```

### Task 5: `feltSegmentsRepo.ts`

**Files:**
- Create: `src/data/feltSegmentsRepo.ts`
- Test: `src/data/feltSegmentsRepo.test.ts`

Exact structural mirror of `src/data/feltPointsRepo.ts` — same French error-message
convention, same snake_case↔camelCase mapping, same `createSupabaseChainMock`-based
tests. The only difference is the flattened `pointA`/`pointB` → `ax,ay,bx,by` mapping.

- [ ] **Step 1: Write failing tests**

```typescript
// src/data/feltSegmentsRepo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFeltSegment, deleteFeltSegment, listFeltSegmentsForPlan } from './feltSegmentsRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('feltSegmentsRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a felt segment', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'fs1', plan_id: 'p1', network_name: 'Hartmann',
        ax: 1, ay: 2, bx: 3, by: 4, created_at: '2026-07-20T10:00:00Z',
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const segment = await createFeltSegment({
      planId: 'p1', networkName: 'Hartmann', pointA: { x: 1, y: 2 }, pointB: { x: 3, y: 4 },
    })

    expect(from).toHaveBeenCalledWith('felt_segment')
    expect(chain.insert).toHaveBeenCalledWith({
      plan_id: 'p1', network_name: 'Hartmann', ax: 1, ay: 2, bx: 3, by: 4,
    })
    expect(segment.pointA).toEqual({ x: 1, y: 2 })
    expect(segment.pointB).toEqual({ x: 3, y: 4 })
  })

  it('throws a descriptive French error when creation fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(
      createFeltSegment({ planId: 'p1', networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 1, y: 1 } })
    ).rejects.toThrow("Impossible d'enregistrer le segment ressenti : network down")
  })

  it('lists felt segments scoped to a plan', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [
        { id: 'fs1', plan_id: 'p1', network_name: 'Hartmann', ax: 0, ay: 0, bx: 1, by: 1, created_at: '2026-07-20T10:00:00Z' },
      ],
      error: null,
    })
    vi.mocked(supabase).from = from

    const segments = await listFeltSegmentsForPlan('p1')

    expect(chain.eq).toHaveBeenCalledWith('plan_id', 'p1')
    expect(segments).toHaveLength(1)
    expect(segments[0].networkName).toBe('Hartmann')
  })

  it('deletes a felt segment', async () => {
    const { from, chain } = createSupabaseChainMock({ data: null, error: null })
    vi.mocked(supabase).from = from

    await deleteFeltSegment('fs1')

    expect(from).toHaveBeenCalledWith('felt_segment')
    expect(chain.eq).toHaveBeenCalledWith('id', 'fs1')
  })

  it('throws a descriptive French error when deletion fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(deleteFeltSegment('fs1')).rejects.toThrow(
      'Impossible de supprimer le segment ressenti : network down'
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/data/feltSegmentsRepo.test.ts`
Expected: FAIL — `Cannot find module './feltSegmentsRepo'`

- [ ] **Step 3: Implement `feltSegmentsRepo.ts`**

```typescript
// src/data/feltSegmentsRepo.ts
import { supabase } from '../lib/supabaseClient'
import type { FeltSegment, Point } from '../domain/types'

export interface CreateFeltSegmentInput {
  planId: string
  networkName: string
  pointA: Point
  pointB: Point
}

interface FeltSegmentRow {
  id: string
  plan_id: string
  network_name: string
  ax: number
  ay: number
  bx: number
  by: number
  created_at: string
}

function mapRowToFeltSegment(row: FeltSegmentRow): FeltSegment {
  return {
    id: row.id,
    planId: row.plan_id,
    networkName: row.network_name,
    pointA: { x: row.ax, y: row.ay },
    pointB: { x: row.bx, y: row.by },
    createdAt: row.created_at,
  }
}

export async function createFeltSegment(input: CreateFeltSegmentInput): Promise<FeltSegment> {
  const { data, error } = await supabase
    .from('felt_segment')
    .insert({
      plan_id: input.planId,
      network_name: input.networkName,
      ax: input.pointA.x,
      ay: input.pointA.y,
      bx: input.pointB.x,
      by: input.pointB.y,
    })
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer le segment ressenti : ${error.message}`)
  return mapRowToFeltSegment(data as FeltSegmentRow)
}

export async function deleteFeltSegment(id: string): Promise<void> {
  const { error } = await supabase.from('felt_segment').delete().eq('id', id)
  if (error) throw new Error(`Impossible de supprimer le segment ressenti : ${error.message}`)
}

export async function listFeltSegmentsForPlan(planId: string): Promise<FeltSegment[]> {
  const { data, error } = await supabase.from('felt_segment').select().eq('plan_id', planId)

  if (error) throw new Error(`Impossible de charger les segments ressentis : ${error.message}`)
  return (data as FeltSegmentRow[]).map(mapRowToFeltSegment)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/data/feltSegmentsRepo.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/feltSegmentsRepo.ts src/data/feltSegmentsRepo.test.ts
git commit -m "Add feltSegmentsRepo: CRUD for felt_segment, mirroring feltPointsRepo"
```

### Task 6: Pairing logic in `arucoMapping.ts`

**Files:**
- Modify: `src/vision/arucoMapping.ts`
- Modify: `src/vision/arucoMapping.test.ts`

**What changes and why (read before editing):** `RecognizedPoint` currently carries
only `{ networkName, x, y }`. It needs to gain both `markerId` (to dedup a marker
detected twice in one frame) and `rodNumber` (to group two markers of the same
physical rod together) — the spec discusses threading `rodNumber` through the
internal lookup map, but the actual grouping step downstream needs both fields
directly on each `RecognizedPoint`, which this task makes explicit. Adding fields to
`RecognizedPoint` breaks the 3 existing tests' `toEqual` assertions (`toEqual` fails on
extra properties) — update them as part of this task, don't just add new ones.

- [ ] **Step 1: Update existing tests for the new `RecognizedPoint` shape**

In `src/vision/arucoMapping.test.ts`, update the first test's assertion (the rest are
unaffected — they assert `totalRecognized`/empty arrays, not full object shape):

```typescript
    expect(result.recognized).toEqual([
      { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 105, y: 205 }, // centroid (5,5) + (100,200)
      { markerId: 201, rodNumber: 1, networkName: 'Curry', x: 125, y: 205 }, // centroid (25,5) + (100,200)
    ])
```

- [ ] **Step 2: Run tests to verify this one now fails (proves the old shape was asserted)**

Run: `node_modules/.bin/vitest.cmd run src/vision/arucoMapping.test.ts`
Expected: FAIL — actual result missing `markerId`/`rodNumber` (implementation not
updated yet)

- [ ] **Step 3: Add `markerId`/`rodNumber` to `RecognizedPoint` and the lookup map**

```typescript
// src/vision/arucoMapping.ts — replace RecognizedPoint and the lookup logic
export interface RecognizedPoint {
  markerId: number
  rodNumber: number
  networkName: string
  x: number
  y: number
}
```

```typescript
export function mapDetectionsToPoints(
  detections: RawMarkerDetection[],
  calibration: AffineTransform,
  rodMarkers: RodMarker[]
): MappingResult {
  const markerById = new Map(rodMarkers.map((m) => [m.markerId, m]))
  const recognized: RecognizedPoint[] = []

  for (const detection of detections) {
    const marker = markerById.get(detection.markerId)
    if (marker === undefined) continue

    const real = applyAffineTransform(centroid(detection.corners), calibration)
    recognized.push({
      markerId: marker.markerId,
      rodNumber: marker.rodNumber,
      networkName: marker.networkName,
      x: real.x,
      y: real.y,
    })
  }

  return { recognized, totalDetected: detections.length, totalRecognized: recognized.length }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/vision/arucoMapping.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write failing tests for the new pairing function**

Append to `src/vision/arucoMapping.test.ts`:

```typescript
import { pairIntoSegmentsAndPoints } from './arucoMapping'

describe('pairIntoSegmentsAndPoints', () => {
  it('pairs 2 recognized points of the same rod into a segment', () => {
    const result = pairIntoSegmentsAndPoints([
      { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 0, y: 0 },
      { markerId: 102, rodNumber: 1, networkName: 'Hartmann', x: 4, y: 0 },
    ])

    expect(result.segments).toEqual([
      { networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 } },
    ])
    expect(result.points).toEqual([])
  })

  it('keeps a lone recognized point as a point, not a segment', () => {
    const result = pairIntoSegmentsAndPoints([
      { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 0, y: 0 },
    ])

    expect(result.segments).toEqual([])
    expect(result.points).toEqual([
      { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 0, y: 0 },
    ])
  })

  it('does not merge points from different rods or different networks', () => {
    const result = pairIntoSegmentsAndPoints([
      { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 0, y: 0 },
      { markerId: 201, rodNumber: 2, networkName: 'Hartmann', x: 10, y: 10 }, // different rod, same network
      { markerId: 301, rodNumber: 1, networkName: 'Curry', x: 20, y: 20 }, // same rod number, different network
    ])

    expect(result.segments).toEqual([])
    expect(result.points).toHaveLength(3)
  })

  it('dedups a marker detected twice in the same frame before pairing', () => {
    const result = pairIntoSegmentsAndPoints([
      { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 0, y: 0 },
      { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 0.01, y: 0.01 }, // duplicate detection, slightly different centroid
      { markerId: 102, rodNumber: 1, networkName: 'Hartmann', x: 4, y: 0 },
    ])

    // Without dedup this would be a 3-point group; with dedup it's exactly one
    // segment from markers 101 and 102, using the FIRST occurrence of 101.
    expect(result.segments).toEqual([
      { networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 } },
    ])
    expect(result.points).toEqual([])
  })

  it('defensively takes the 2 lowest marker IDs if a group somehow has 3+ distinct markers', () => {
    // Not expected to occur with correctly-seeded rod_marker data (each rod
    // has exactly 2 distinct marker IDs by construction), but the grouping
    // itself has no schema-enforced cap — stay correct if it ever does.
    const result = pairIntoSegmentsAndPoints([
      { markerId: 103, rodNumber: 1, networkName: 'Hartmann', x: 8, y: 8 },
      { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 0, y: 0 },
      { markerId: 102, rodNumber: 1, networkName: 'Hartmann', x: 4, y: 0 },
    ])

    expect(result.segments).toEqual([
      { networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 } },
    ])
    expect(result.points).toEqual([])
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/vision/arucoMapping.test.ts`
Expected: FAIL — `pairIntoSegmentsAndPoints` not defined

- [ ] **Step 7: Implement `pairIntoSegmentsAndPoints`**

Append to `src/vision/arucoMapping.ts`:

```typescript
export interface FeltSegmentCandidate {
  networkName: string
  pointA: Point
  pointB: Point
}

export interface PairingResult {
  segments: FeltSegmentCandidate[]
  points: RecognizedPoint[]
}

/**
 * Groups recognized points by (networkName, rodNumber) — the two markers of
 * the same physical rod, per spec §3.2. A duplicate detection of the same
 * markerId within one frame is deduped first (keep first occurrence), so a
 * group can only exceed 2 members if rod_marker itself has more than 2
 * distinct marker IDs for one (networkName, rodNumber) pair — not expected
 * given how rod_marker is seeded, but handled defensively: only the 2 lowest
 * marker IDs in a group become a segment, extras are silently dropped.
 */
export function pairIntoSegmentsAndPoints(recognized: RecognizedPoint[]): PairingResult {
  const seenMarkerIds = new Set<number>()
  const deduped: RecognizedPoint[] = []
  for (const point of recognized) {
    if (seenMarkerIds.has(point.markerId)) continue
    seenMarkerIds.add(point.markerId)
    deduped.push(point)
  }

  const groups = new Map<string, RecognizedPoint[]>()
  for (const point of deduped) {
    const key = `${point.networkName}::${point.rodNumber}`
    const group = groups.get(key)
    if (group) group.push(point)
    else groups.set(key, [point])
  }

  const segments: FeltSegmentCandidate[] = []
  const points: RecognizedPoint[] = []
  for (const group of groups.values()) {
    if (group.length >= 2) {
      const [a, b] = [...group].sort((x, y) => x.markerId - y.markerId)
      segments.push({ networkName: a.networkName, pointA: { x: a.x, y: a.y }, pointB: { x: b.x, y: b.y } })
    } else {
      points.push(group[0])
    }
  }

  return { segments, points }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/vision/arucoMapping.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 9: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/vision/arucoMapping.ts src/vision/arucoMapping.test.ts
git commit -m "Add pairIntoSegmentsAndPoints: group recognized points by rod, dedup by markerId"
```

### Task 7: Wire pairing into `RodDetectionPanel`

**Files:**
- Modify: `src/components/RodDetectionPanel.tsx`
- Modify: `src/components/RodDetectionPanel.test.tsx`

- [ ] **Step 1: Write a failing test for segment creation + richer summary**

Add after the existing "runs the full pipeline on click" test:

```tsx
  it('creates a FeltSegment for a paired rod and reports the split in the summary', async () => {
    vi.mocked(arucoDetector.detectMarkers).mockReturnValue([
      { markerId: 101, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
      { markerId: 102, corners: [{ x: 40, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 10 }, { x: 40, y: 10 }] },
    ])
    vi.mocked(rodMarkersRepo.listRodMarkers).mockResolvedValue([
      { markerId: 101, networkName: 'Hartmann', rodNumber: 1 },
      { markerId: 102, networkName: 'Hartmann', rodNumber: 1 },
    ])
    vi.mocked(arucoMapping.mapDetectionsToPoints).mockReturnValue({
      recognized: [
        { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 0, y: 0 },
        { markerId: 102, rodNumber: 1, networkName: 'Hartmann', x: 4, y: 0 },
      ],
      totalDetected: 2,
      totalRecognized: 2,
    })
    vi.mocked(arucoMapping.pairIntoSegmentsAndPoints).mockReturnValue({
      segments: [{ networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 } }],
      points: [],
    })
    vi.mocked(feltSegmentsRepo.createFeltSegment).mockResolvedValue({
      id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 }, createdAt: '2026-07-20T10:00:00Z',
    })

    render(
      <RodDetectionPanel
        photo={calibratedPhoto}
        planId="p1"
        missionOrigin={{ lat: 48.8566, lng: 2.3522 }}
        mapCenter={[48.8566, 2.3522]}
        onCalibrated={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /détecter les tiges/i }))

    await waitFor(() =>
      expect(feltSegmentsRepo.createFeltSegment).toHaveBeenCalledWith({
        planId: 'p1', networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 },
      })
    )
    expect(feltPointsRepo.createFeltPoint).not.toHaveBeenCalled()
    expect(await screen.findByText('2 marqueurs détectés, 2 reconnus (1 tiges complètes, 0 points isolés).')).toBeInTheDocument()
  })
```

Add the two new imports/mocks this test needs, alongside the existing ones at the top
of the file:

```typescript
import * as feltSegmentsRepo from '../data/feltSegmentsRepo'
```

```typescript
vi.mock('../data/feltSegmentsRepo')
```

- [ ] **Step 2: Run tests to verify the new test fails**

Run: `node_modules/.bin/vitest.cmd run src/components/RodDetectionPanel.test.tsx`
Expected: FAIL — `pairIntoSegmentsAndPoints`/`createFeltSegment` not called, summary
text doesn't match

- [ ] **Step 3: Update `RodDetectionPanel.handleDetect`**

```typescript
// src/components/RodDetectionPanel.tsx — add imports
import { mapDetectionsToPoints, pairIntoSegmentsAndPoints } from '../vision/arucoMapping'
import { createFeltSegment } from '../data/feltSegmentsRepo'
```

Replace `handleDetect`'s body (the function already imports `mapDetectionsToPoints`;
just add the `pairIntoSegmentsAndPoints` import above and edit the body below):

```typescript
  async function handleDetect() {
    if (!photo.calibration) return
    setDetecting(true)
    setError(null)
    setSummary(null)
    try {
      const image = await loadImage(photo.imageUrl)
      const detections = detectMarkers(image)
      const rodMarkers = await listRodMarkers()
      const { recognized, totalDetected, totalRecognized } = mapDetectionsToPoints(
        detections,
        photo.calibration,
        rodMarkers
      )
      const { segments, points } = pairIntoSegmentsAndPoints(recognized)

      await Promise.all([
        ...points.map((point) =>
          createFeltPoint({ planId, networkName: point.networkName, x: point.x, y: point.y })
        ),
        ...segments.map((segment) =>
          createFeltSegment({
            planId,
            networkName: segment.networkName,
            pointA: segment.pointA,
            pointB: segment.pointB,
          })
        ),
      ])

      setSummary(
        `${totalDetected} marqueurs détectés, ${totalRecognized} reconnus ` +
          `(${segments.length} tiges complètes, ${points.length} points isolés).`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDetecting(false)
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/components/RodDetectionPanel.test.tsx`
Expected: PASS (4 tests) — note the pre-existing "runs the full pipeline on click" test
mocks `arucoMapping.mapDetectionsToPoints` but not `pairIntoSegmentsAndPoints`; since
`vi.mock('../vision/arucoMapping')` auto-mocks the whole module, an unmocked
`pairIntoSegmentsAndPoints` call returns `undefined` and destructuring `{ segments,
points }` from it throws. Fix that pre-existing test by adding a default mock:

```typescript
    vi.mocked(arucoMapping.pairIntoSegmentsAndPoints).mockReturnValue({
      segments: [],
      points: [{ markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 5, y: 5 }],
    })
```

(insert this alongside that test's existing `arucoMapping.mapDetectionsToPoints` mock,
and update its final assertion to match the new summary format: `'1 marqueurs
détectés, 1 reconnus (0 tiges complètes, 1 points isolés).'`)

Re-run after this fix:

Run: `node_modules/.bin/vitest.cmd run src/components/RodDetectionPanel.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/components/RodDetectionPanel.tsx src/components/RodDetectionPanel.test.tsx
git commit -m "Wire pairIntoSegmentsAndPoints into RodDetectionPanel: create FeltSegments for paired rods"
```

### Task 8: `FeltSegmentsLayer` — Leaflet rendering

**Files:**
- Create: `src/components/FeltSegmentsLayer.tsx`
- Test: `src/components/FeltSegmentsLayer.test.tsx`

Same family as `FeltPointsLayer`/`BaguaLayer`, but renders a `Polyline` (see
`GuideLineLayer.tsx` for the exact `Polyline` usage pattern already in this codebase)
instead of a `CircleMarker`.

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/FeltSegmentsLayer.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { FeltSegmentsLayer } from './FeltSegmentsLayer'
import type { FeltSegment } from '../domain/types'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const segments: FeltSegment[] = [
  { id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 }, createdAt: '2026-07-20T10:00:00Z' },
  { id: 'fs2', planId: 'p1', networkName: 'Curry', pointA: { x: -1, y: -1 }, pointB: { x: 1, y: 1 }, createdAt: '2026-07-20T10:01:00Z' },
]

describe('FeltSegmentsLayer', () => {
  it('renders one polyline per segment, colored by its network', () => {
    const colorForNetwork = (name: string) => (name === 'Hartmann' ? '#d32f2f' : '#f2c230')
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FeltSegmentsLayer segments={segments} colorForNetwork={colorForNetwork} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    const lines = container.querySelectorAll('path.leaflet-interactive')
    expect(lines).toHaveLength(2)
    expect(lines[0].getAttribute('stroke')).toBe('#d32f2f')
    expect(lines[1].getAttribute('stroke')).toBe('#f2c230')
  })

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FeltSegmentsLayer segments={segments} colorForNetwork={() => '#000'} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })

  it('renders nothing when there are no segments', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FeltSegmentsLayer segments={[]} colorForNetwork={() => '#000'} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/components/FeltSegmentsLayer.test.tsx`
Expected: FAIL — `Cannot find module './FeltSegmentsLayer'`

- [ ] **Step 3: Implement `FeltSegmentsLayer`**

```tsx
// src/components/FeltSegmentsLayer.tsx
import { Polyline } from 'react-leaflet'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import type { FeltSegment } from '../domain/types'

export interface FeltSegmentsLayerProps {
  segments: FeltSegment[]
  colorForNetwork: (networkName: string) => string
  missionOrigin: LatLng
  visible: boolean
}

export function FeltSegmentsLayer({ segments, colorForNetwork, missionOrigin, visible }: FeltSegmentsLayerProps) {
  if (!visible) return null

  return (
    <>
      {segments.map((segment) => {
        const a = localToLatLng(segment.pointA, missionOrigin)
        const b = localToLatLng(segment.pointB, missionOrigin)
        return (
          <Polyline
            key={segment.id}
            positions={[[a.lat, a.lng], [b.lat, b.lng]]}
            pathOptions={{ color: colorForNetwork(segment.networkName), weight: 3 }}
          />
        )
      })}
    </>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/components/FeltSegmentsLayer.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/components/FeltSegmentsLayer.tsx src/components/FeltSegmentsLayer.test.tsx
git commit -m "Add FeltSegmentsLayer: renders felt-segment polylines colored by network"
```

### Task 9: Wire into `LayerPanel` and `SiteMapView`

**Files:**
- Modify: `src/components/LayerPanel.tsx` + `.test.tsx`
- Modify: `src/components/SiteMapView.tsx` + `.test.tsx`

- [ ] **Step 1: Add a layer id and checkbox to `LayerPanel`**

`LayerPanel.test.tsx` wasn't read in full while writing this plan — before editing,
check its existing test structure for `FELT_POINTS_LAYER_ID` (defaults to visible,
`?? true`) and mirror that pattern exactly for the new id, not the Bagua one (`?? false`)
— this layer is real field data, like felt points, not an auxiliary derived layer.

```typescript
// src/components/LayerPanel.tsx — add alongside FELT_POINTS_LAYER_ID/BAGUA_LAYER_ID
export const FELT_SEGMENTS_LAYER_ID = 'felt-segments'
```

Add a checkbox in the JSX (after the existing "Ressenti terrain" checkbox, same
structure, defaulting to visible):

```tsx
      <label>
        <input
          type="checkbox"
          checked={visibility[FELT_SEGMENTS_LAYER_ID] ?? true}
          onChange={() => onToggle(FELT_SEGMENTS_LAYER_ID)}
        />
        Tiges (segments ressentis)
      </label>
```

Add a corresponding test in `LayerPanel.test.tsx`, following its existing test
structure for the felt-points checkbox (find that test and mirror it exactly with the
new id/label).

Run: `node_modules/.bin/vitest.cmd run src/components/LayerPanel.test.tsx`
Expected: PASS

- [ ] **Step 2: Fetch felt segments in `SiteMapView` and render the layer**

Re-read the current `src/components/SiteMapView.tsx` in full first — Chunk 1's Task 2
already modified the load effect and `colorForNetwork`; confirm exact current line
numbers before editing further, since this plan's references may have shifted.

```typescript
// src/components/SiteMapView.tsx — add imports
import { listFeltSegmentsForPlan } from '../data/feltSegmentsRepo'
import { FeltSegmentsLayer } from './FeltSegmentsLayer'
import { FELT_SEGMENTS_LAYER_ID } from './LayerPanel' // add to the existing named import from './LayerPanel'
import type { FeltSegment } from '../domain/types' // add to the existing type-only import from '../domain/types'
```

```typescript
// add state, alongside feltPoints:
const [feltSegments, setFeltSegments] = useState<FeltSegment[]>([])
```

Extend the load effect's `Promise.all` (from Chunk 1 Task 2) to also fetch segments:

```typescript
        const [loadedInstances, loadedPoints, loadedTemplates, loadedSegments] = await Promise.all([
          listGridInstancesForPlan(planId),
          listFeltPointsForPlan(planId),
          listGridTemplates(),
          listFeltSegmentsForPlan(planId),
        ])
        setInstances(loadedInstances)
        setFeltPoints(loadedPoints)
        setTemplates(loadedTemplates)
        setFeltSegments(loadedSegments)
```

Render the layer in the JSX, inside `<MapView>`, alongside `<FeltPointsLayer>`:

```tsx
        <FeltSegmentsLayer
          segments={feltSegments}
          colorForNetwork={colorForNetwork}
          missionOrigin={missionOrigin}
          visible={visibility[FELT_SEGMENTS_LAYER_ID] ?? true}
        />
```

- [ ] **Step 3: Update `SiteMapView.test.tsx`**

Add the mock and file-wide default, same pattern as Chunk 1 Task 2:

```typescript
import * as feltSegmentsRepo from '../data/feltSegmentsRepo'
```

```typescript
vi.mock('../data/feltSegmentsRepo')
```

```tsx
vi.mock('./FeltSegmentsLayer', () => ({
  FeltSegmentsLayer: ({ visible }: { visible: boolean }) => (visible ? <div data-testid="felt-segments" /> : null),
}))
```

```typescript
// inside the shared beforeEach, alongside the gridTemplatesRepo default from Chunk 1:
vi.mocked(feltSegmentsRepo.listFeltSegmentsForPlan).mockResolvedValue([])
```

- [ ] **Step 4: Write a failing integration test**

```tsx
  it('loads felt segments and shows the layer by default', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(feltSegmentsRepo.listFeltSegmentsForPlan).mockResolvedValue([
      { id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 }, createdAt: '2026-07-20T10:00:00Z' },
    ])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    expect(await screen.findByTestId('felt-segments')).toBeInTheDocument()
  })
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/components/SiteMapView.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 6: Type-check, run the full suite, and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Run: `node_modules/.bin/vitest.cmd run`
Expected: all tests green

```bash
git add src/components/LayerPanel.tsx src/components/LayerPanel.test.tsx src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx
git commit -m "Wire FeltSegmentsLayer into LayerPanel and SiteMapView"
```

---

## Note on the parallel pathogenic-crossings plan

A separate, already-approved plan
(`docs/superpowers/plans/2026-07-21-pathogenic-crossing-detection-plan.md`) also adds a
layer by modifying `LayerPanel.tsx` + `SiteMapView.tsx`, independently of this plan.
Whichever of the two is executed second will need to merge/rebase past the other's
edits to those two files — expect ordinary merge conflicts in the named-import lists
and the `<MapView>` JSX, not a design conflict.
