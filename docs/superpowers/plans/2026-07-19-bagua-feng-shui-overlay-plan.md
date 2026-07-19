# Superposition Bagua (Feng Shui classique) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if
> subagents available) or superpowers:executing-plans to implement this plan. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Superpose a classical Pakua/Bagua 8-sector grid (compass-oriented, centered on
an automatically-detected building footprint) on a GEOBIO mission's map, with a static
correspondence table of corrective objects per sector.

**Architecture:** Reuses GEOBIO's existing geometry/rendering infrastructure
(`bearingUnitVector`-style pure functions, Leaflet layer components, the mission-local
coordinate system) rather than any external feng-shui library — none of the libraries
researched do spatial overlay, only personal-birth-data calculations GEOBIO explicitly
doesn't need. A new IGN WFS service (`BDTOPO_V3:batiment`) supplies the building outline;
the Bagua grid itself is computed on the fly (no new persisted grid table, unlike
Hartmann/Curry) from that outline's centroid plus a fixed true-north orientation.

**Tech Stack:** Same as the rest of GEOBIO — Vite, React, TypeScript, react-leaflet,
Supabase (Postgres + Storage), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-19-bagua-feng-shui-overlay-design.md` — read
this first for the full rationale behind every decision below (why classical Pakua not
Eight Mansions, why compass not entrance-based orientation, why the building footprint
comes from `BDTOPO_V3:batiment` and not the cadastral parcel).

**Worktree:** This plan executes in the same worktree as Plan 1 (already fully
implemented, 34 tasks, 125 tests green): `D:\LAURENT PC\GEOBIO\.worktrees\plan1-moteur-reseaux`,
branch `plan1-moteur-reseaux`. Node/npm may not be on PATH directly — use
`node_modules/.bin/vitest.cmd` / `node_modules/.bin/tsc.cmd` if `npx` fails, after
`export PATH="/c/Program Files/nodejs:$PATH"` in Bash, or use PowerShell where Node is
already on PATH.

---

## Chunk 1: Building footprint data layer

**Why this chunk first:** everything else (geometry, rendering) needs a `Point[]`
building outline to work with. This chunk gets one stored on the `Mission`, sourced from
a new IGN WFS layer.

### Task 1: `Mission.buildingFootprint` — schema, type, repo

**Files:**
- Create: `supabase/migrations/0012_mission_building_footprint.sql`
- Modify: `src/domain/types.ts` (add `Mission.buildingFootprint`)
- Modify: `src/data/missionsRepo.ts` + `.test.ts` (add `setBuildingFootprint`)
- Modify: `src/components/MissionForm.test.tsx`, `src/pages/MissionWorkspace.test.tsx`
  (blast radius — every `Mission`-shaped fixture needs the new field)

**Blast radius, following the exact pattern every prior "widen `Mission`" task in Plan 1
has hit (Tasks 21, 23, 27) — treat this as a checklist:**
- `src/data/missionsRepo.test.ts` — every `MissionRow`-shaped DB row literal needs
  `building_footprint: null` (or a real array for the one new test below), every expected
  `Mission` object needs `buildingFootprint: null` (or the matching array)
- `src/components/MissionForm.test.tsx` — the `mission` fixture object literal
- `src/pages/MissionWorkspace.test.tsx` — the inline `MissionForm` mock's `onCreated`
  object, `missionWithOrigin`, and `missionAfterGlobalAssessment` (all three — Task 27's
  own implementer initially missed the third of these three and had to add it after
  `tsc` failed; don't repeat that, grep the whole file for any object literal with both
  `address` and `missionDate` fields to be sure none are missed)

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/0012_mission_building_footprint.sql
alter table mission add column building_footprint jsonb;
```

(Nullable, no default — most missions won't have one yet. `jsonb` for a `Point[]` array
matches the existing convention, e.g. `grid_line.theoretical_points`,
`freeform_network.points` in `0001_plan1_schema.sql`.)

- [ ] **Step 2: Apply it**

Run: `npx supabase db push` — **do not run this yourself if you are an AI agent; this
writes to the shared remote database and needs the human user's direct, real-time
authorization. Stop here and ask.**

- [ ] **Step 3: Widen the `Mission` type**

```typescript
// src/domain/types.ts — modify Mission
export interface Mission {
  id: string
  address: string
  missionDate: string // ISO date
  declinationDeg: number | null
  originLat: number | null
  originLng: number | null
  causeArchitectural: number | null
  causeElectromagnetique: number | null
  causeGeobiologique: number | null
  causeParanormale: number | null
  causeAutres: number | null
  bovisRate: number | null
  parcelRefs: string[]
  /** Outer ring only (holes/multi-ring buildings not modeled — see spec §6 for the
   * tradeoff). Null until a building is fetched and confirmed via "Changer de bâtiment". */
  buildingFootprint: Point[] | null
}
```

- [ ] **Step 4: Write a failing test for `setBuildingFootprint`**

```typescript
// append to src/data/missionsRepo.test.ts
it('sets the building footprint and maps it back', async () => {
  const footprint = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 8 },
    { x: 0, y: 8 },
  ]
  const { from, chain } = createSupabaseChainMock({
    data: {
      id: 'm1', address: 'A', mission_date: '2026-07-20', declination_deg: null,
      origin_lat: null, origin_lng: null,
      cause_architectural: null, cause_electromagnetique: null, cause_geobiologique: null,
      cause_paranormale: null, cause_autres: null, bovis_rate: null, parcel_refs: [],
      building_footprint: footprint,
    },
    error: null,
  })
  vi.mocked(supabase).from = from

  const mission = await setBuildingFootprint('m1', footprint)

  expect(from).toHaveBeenCalledWith('mission')
  expect(chain.eq).toHaveBeenCalledWith('id', 'm1')
  expect(chain.update).toHaveBeenCalledWith({ building_footprint: footprint })
  expect(mission.buildingFootprint).toEqual(footprint)
})

it('throws a descriptive French error when setting the building footprint fails', async () => {
  const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
  vi.mocked(supabase).from = from

  await expect(setBuildingFootprint('m1', [])).rejects.toThrow(
    "Impossible d'enregistrer le contour du bâtiment : network down"
  )
})
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/data/missionsRepo.test.ts`
Expected: FAIL — `setBuildingFootprint is not a function` (plus every pre-existing test in
this file also failing, since `MissionRow`/expected-`Mission` fixtures don't have
`building_footprint`/`buildingFootprint` yet — that's expected at this point, Step 7
fixes it)

- [ ] **Step 6: Implement `setBuildingFootprint`, widen `MissionRow`/`mapRowToMission`**

```typescript
// src/data/missionsRepo.ts — modify MissionRow and mapRowToMission, add:
interface MissionRow {
  id: string
  address: string
  mission_date: string
  declination_deg: number | null
  origin_lat: number | null
  origin_lng: number | null
  cause_architectural: number | null
  cause_electromagnetique: number | null
  cause_geobiologique: number | null
  cause_paranormale: number | null
  cause_autres: number | null
  bovis_rate: number | null
  parcel_refs: string[]
  building_footprint: Point[] | null
}

function mapRowToMission(row: MissionRow): Mission {
  return {
    id: row.id,
    address: row.address,
    missionDate: row.mission_date,
    declinationDeg: row.declination_deg,
    originLat: row.origin_lat,
    originLng: row.origin_lng,
    causeArchitectural: row.cause_architectural,
    causeElectromagnetique: row.cause_electromagnetique,
    causeGeobiologique: row.cause_geobiologique,
    causeParanormale: row.cause_paranormale,
    causeAutres: row.cause_autres,
    bovisRate: row.bovis_rate,
    parcelRefs: row.parcel_refs,
    buildingFootprint: row.building_footprint,
  }
}

export async function setBuildingFootprint(missionId: string, footprint: Point[]): Promise<Mission> {
  const { data, error } = await supabase
    .from('mission')
    .update({ building_footprint: footprint })
    .eq('id', missionId)
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer le contour du bâtiment : ${error.message}`)
  return mapRowToMission(data as MissionRow)
}
```

Add `import type { Point } from '../domain/types'` if `Point` isn't already imported in
this file (check first — `Mission` is already imported from the same module).

- [ ] **Step 7: Fix the blast radius**

Add `building_footprint: null` to every `MissionRow`-shaped DB row literal in
`missionsRepo.test.ts` (the pre-existing tests, not the two new ones from Step 4), and
`buildingFootprint: null` to every expected `Mission` object in that same file. Then add
`buildingFootprint: null` to the fixtures listed in this task's "Blast radius" note above:
`MissionForm.test.tsx`'s `mission` fixture, and `MissionWorkspace.test.tsx`'s inline
`MissionForm` mock object, `missionWithOrigin`, and `missionAfterGlobalAssessment`.

- [ ] **Step 8: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/data/missionsRepo.test.ts src/components/MissionForm.test.tsx src/pages/MissionWorkspace.test.tsx`
Expected: PASS, all tests in all three files

- [ ] **Step 9: Type-check**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: no errors. If it reports a missing `buildingFootprint` property anywhere not
listed in this task's blast-radius note, fix it there too before moving on.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/0012_mission_building_footprint.sql src/domain/types.ts src/data/missionsRepo.ts src/data/missionsRepo.test.ts src/components/MissionForm.test.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "Add Mission.buildingFootprint: schema, type, setBuildingFootprint repo function"
```

---

### Task 2: `buildingFootprintService.ts` — fetch building outlines from IGN

**Files:**
- Create: `src/data/buildingFootprintService.ts`
- Test: `src/data/buildingFootprintService.test.ts`

**Same shape as `src/data/cadastreService.ts` (Task 27 of Plan 1) — read that file first**,
this task mirrors it closely but targets a different IGN WFS layer
(`BDTOPO_V3:batiment` instead of `CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle`), on the
same endpoint. `cadastreService.ts` already has the corrected BBOX axis order
(lat,lng — fixed 2026-07-19, verified against IGN docs) and an `AbortSignal` parameter;
follow both conventions here too.

- [ ] **Step 1: Write failing tests for parsing and fetching**

```typescript
// src/data/buildingFootprintService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchBuildingsInBounds } from './buildingFootprintService'

const sampleGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 'BATIMENT0000001234' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2.35, 48.85],
            [2.3502, 48.85],
            [2.3502, 48.8502],
            [2.35, 48.8502],
            [2.35, 48.85],
          ],
        ],
      },
    },
  ],
}

describe('fetchBuildingsInBounds', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('parses building features into ringsLatLng, using lat,lng BBOX axis order', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleGeoJson),
    } as Response)

    const buildings = await fetchBuildingsInBounds({ minLat: 48.85, maxLat: 48.86, minLng: 2.35, maxLng: 2.36 })

    expect(buildings).toHaveLength(1)
    expect(buildings[0].ringsLatLng[0][0]).toEqual({ lat: 48.85, lng: 2.35 })

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('TYPENAME=BDTOPO_V3:batiment')
    expect(calledUrl).toContain('BBOX=48.85,2.35,48.86,2.36,EPSG:4326')
  })

  it('throws a descriptive French error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)

    await expect(
      fetchBuildingsInBounds({ minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 })
    ).rejects.toThrow('Impossible de charger les bâtiments : 500')
  })

  it('forwards an AbortSignal to fetch when one is passed', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleGeoJson),
    } as Response)
    const controller = new AbortController()

    await fetchBuildingsInBounds({ minLat: 48.85, maxLat: 48.86, minLng: 2.35, maxLng: 2.36 }, controller.signal)

    expect(fetch).toHaveBeenCalledWith(expect.any(String), { signal: controller.signal })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/data/buildingFootprintService.test.ts`
Expected: FAIL — `Cannot find module './buildingFootprintService'`

- [ ] **Step 3: Implement `buildingFootprintService`**

```typescript
// src/data/buildingFootprintService.ts
import type { LatLng } from '../geometry/localCoordinates'

export interface BuildingFootprint {
  ringsLatLng: LatLng[][]
}

export interface LatLngBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

// Verified 2026-07-19 against IGN Géoplateforme docs (BDTOPO catalogue): BDTOPO_V3:batiment
// is a real WFS layer on the same endpoint as the cadastral parcels layer used in
// cadastreService.ts, separate from CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle. Not yet
// confirmed via a live GetCapabilities/DescribeFeatureType call — do that once before
// relying on this in production, same caveat as cadastreService.ts.
const CADASTRE_WFS_URL = 'https://data.geopf.fr/wfs/ows'
const BUILDING_TYPE_NAME = 'BDTOPO_V3:batiment'

function parseBuildingFeature(feature: { geometry: { coordinates: number[][][] } }): BuildingFootprint {
  const ringsLatLng: LatLng[][] = feature.geometry.coordinates.map((ring) =>
    ring.map(([lng, lat]) => ({ lat, lng }))
  )
  return { ringsLatLng }
}

export async function fetchBuildingsInBounds(
  bounds: LatLngBounds,
  signal?: AbortSignal
): Promise<BuildingFootprint[]> {
  // WFS 2.0.0 with EPSG:4326 uses the CRS authority's defined axis order (lat, lng) —
  // same convention already verified and fixed in cadastreService.ts 2026-07-19.
  const bbox = `${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng},EPSG:4326`
  const url =
    `${CADASTRE_WFS_URL}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAME=${BUILDING_TYPE_NAME}&OUTPUTFORMAT=application/json&BBOX=${bbox}`

  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`Impossible de charger les bâtiments : ${response.status}`)
  }
  const geojson = (await response.json()) as {
    features: Array<{ geometry: { coordinates: number[][][] } }>
  }
  return geojson.features.map(parseBuildingFeature)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/data/buildingFootprintService.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/data/buildingFootprintService.ts src/data/buildingFootprintService.test.ts
git commit -m "Add buildingFootprintService: fetch building outlines from IGN BDTOPO WFS"
```

---

**Chunk 1 exit criteria:** `node_modules/.bin/vitest.cmd run` and
`node_modules/.bin/tsc.cmd -b --noEmit` both pass. `Mission` can carry a stored building
footprint; a service exists to fetch candidate footprints from IGN given a bounding box.
Nothing wired into the UI yet — that's Chunk 3.

---

## Chunk 2: Bagua geometry (pure, framework-free)

**Why this chunk is independent of Chunk 1:** none of this needs a real building
footprint or a real map to test — it's pure math, following the exact discipline
`src/geometry/gridGeneration.ts` already established in Plan 1 (Chunk 2).

### Task 3: `computeCentroid`

**Files:**
- Create: `src/geometry/bagua.ts`
- Test: `src/geometry/bagua.test.ts`

- [ ] **Step 1: Write failing tests for the centroid**

```typescript
// src/geometry/bagua.test.ts
import { describe, it, expect } from 'vitest'
import { computeCentroid } from './bagua'

describe('computeCentroid', () => {
  it('finds the center of a symmetric square', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    expect(computeCentroid(square)).toEqual({ x: 5, y: 5 })
  })

  it('uses the area-weighted centroid, not the vertex average, on a non-convex L-shape', () => {
    // An L-shaped polygon: a 10x10 square with a 5x5 notch cut from the
    // top-right corner. The vertex average would be pulled toward the notch
    // corner (7 vertices, several clustered near the cut); the true
    // area-centroid sits inside the "meat" of the L, closer to (4.17, 4.17).
    const lShape = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ]
    const centroid = computeCentroid(lShape)
    // Hand-computed via the shoelace-based centroid formula for this exact
    // polygon (area = 75, Cx = Cy = 4.1666...).
    expect(centroid.x).toBeCloseTo(25 / 6, 4)
    expect(centroid.y).toBeCloseTo(25 / 6, 4)

    // The naive vertex average would be (30/6, 30/6) = (5, 5) — distinct
    // enough from the true centroid to catch a wrong-formula regression.
    expect(centroid.x).not.toBeCloseTo(5, 1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/geometry/bagua.test.ts`
Expected: FAIL — `Cannot find module './bagua'`

- [ ] **Step 3: Implement `computeCentroid`**

```typescript
// src/geometry/bagua.ts
import type { Point } from '../domain/types'

/**
 * Area-weighted (true geometric) centroid of a simple polygon, via the
 * shoelace-based centroid formula — NOT a vertex average, which diverges
 * from this on any non-convex polygon (see spec §6 for why this distinction
 * matters for an L-shaped building). `polygon` need not be explicitly closed
 * (last point == first point); this handles both cases.
 */
export function computeCentroid(polygon: Point[]): Point {
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < polygon.length; i++) {
    const p0 = polygon[i]
    const p1 = polygon[(i + 1) % polygon.length]
    const cross = p0.x * p1.y - p1.x * p0.y
    area += cross
    cx += (p0.x + p1.x) * cross
    cy += (p0.y + p1.y) * cross
  }
  area /= 2
  cx /= 6 * area
  cy /= 6 * area
  return { x: cx, y: cy }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/geometry/bagua.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/geometry/bagua.ts src/geometry/bagua.test.ts
git commit -m "Add computeCentroid: area-weighted polygon centroid for Bagua grid center"
```

---

### Task 4: `computeBaguaSectors`

**Files:**
- Modify: `src/geometry/bagua.ts` + `.test.ts`

- [ ] **Step 1: Write failing tests for the 8-sector partition**

```typescript
// append to src/geometry/bagua.test.ts
import { computeBaguaSectors, computeMaxRadius } from './bagua'

describe('computeMaxRadius', () => {
  it('finds the farthest vertex from the centroid', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    // Centroid is (5,5); every corner is sqrt(50) ≈ 7.071 away.
    expect(computeMaxRadius(square, { x: 5, y: 5 })).toBeCloseTo(Math.sqrt(50), 4)
  })
})

describe('computeBaguaSectors', () => {
  it('produces 8 sectors, each spanning 45°, starting from true north', () => {
    const sectors = computeBaguaSectors({ x: 0, y: 0 }, 10)

    expect(sectors).toHaveLength(8)
    expect(sectors.map((s) => s.compassDirection)).toEqual(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'])
  })

  it('centers the "N" sector on bearing 0° (+y axis), symmetric about the y axis', () => {
    const sectors = computeBaguaSectors({ x: 0, y: 0 }, 10)
    const north = sectors.find((s) => s.compassDirection === 'N')!

    // The N sector's two edges sit at bearing -22.5° and +22.5° — symmetric
    // around true north (+y), so their x-coordinates are opposite and their
    // y-coordinates equal and positive. (points[0] is the wedge's center
    // point, i.e. the passed-in center itself; points[1]/points[2] are the
    // two edges.)
    const [edge1, edge2] = north.points.slice(1)
    expect(edge1.x).toBeCloseTo(-edge2.x, 5)
    expect(edge1.y).toBeCloseTo(edge2.y, 5)
    expect(edge1.y).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/geometry/bagua.test.ts`
Expected: FAIL — `computeMaxRadius`/`computeBaguaSectors` are not exported/don't exist

- [ ] **Step 3: Implement `computeMaxRadius` and `computeBaguaSectors`**

```typescript
// src/geometry/bagua.ts — add these, alongside the existing computeCentroid
import { bearingUnitVector } from './gridGeneration'

/**
 * Distance from `center` to the farthest vertex of `polygon` — used as the
 * Bagua grid's radius so the 8 sectors fully cover the building, including
 * its farthest wing on a non-convex (L-shaped) footprint (spec §6). This
 * over-extends slightly on the building's short axis; accepted tradeoff,
 * see spec.
 */
export function computeMaxRadius(polygon: Point[], center: Point): number {
  return Math.max(
    ...polygon.map((p) => Math.hypot(p.x - center.x, p.y - center.y))
  )
}

export type CompassDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'

export interface BaguaSector {
  compassDirection: CompassDirection
  /** Wedge polygon: [center, edge point at bearing-22.5°, edge point at bearing+22.5°]. */
  points: Point[]
}

const COMPASS_ORDER: CompassDirection[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/**
 * 8 equal 45° wedges around `center`, always oriented to true north (bearing
 * 0°) — deliberately NOT parameterized by an angle, unlike
 * generateTheoreticalLines' angleTrueNorthDeg, which is a per-network
 * field-sensed value. The Bagua's orientation is fixed by definition of the
 * classical/compass method (spec §3): passing a variable angle here would be
 * a methodology error, not a missing feature.
 */
export function computeBaguaSectors(center: Point, radiusM: number): BaguaSector[] {
  return COMPASS_ORDER.map((compassDirection, i) => {
    const centerBearing = i * 45
    const edge1 = bearingUnitVector(centerBearing - 22.5)
    const edge2 = bearingUnitVector(centerBearing + 22.5)
    return {
      compassDirection,
      points: [
        center,
        { x: center.x + edge1.x * radiusM, y: center.y + edge1.y * radiusM },
        { x: center.x + edge2.x * radiusM, y: center.y + edge2.y * radiusM },
      ],
    }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/geometry/bagua.test.ts`
Expected: PASS (5 tests — 2 from Task 3's `computeCentroid` plus 3 new: `computeMaxRadius`
and `computeBaguaSectors`'s two tests)

- [ ] **Step 5: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/geometry/bagua.ts src/geometry/bagua.test.ts
git commit -m "Add computeMaxRadius and computeBaguaSectors: 8-wedge partition fixed to true north"
```

---

### Task 5: `baguaCorrespondences.ts` — static object-correspondence table

**Files:**
- Create: `src/domain/baguaCorrespondences.ts`
- Test: `src/domain/baguaCorrespondences.test.ts`

**Content is universal reference data from the spec's source book** (Marc & Pascale
Polizzi, *Initiation à la Géobiologie Quantique Holistique*, "6 - La grille Pakua"
chapter) — not derived from any mission, no repo/API involved. The book's own examples
(spec context): Eau → fontaine, Montagne → bloc de minéral, Terre → composition dans un
bac à fleurs. This task only needs a values table matching `CompassDirection`; the exact
element/object wording per sector should be confirmed against the book's full chapter
before shipping to a real user, but the shape below is enough to build and test against.

- [ ] **Step 1: Write a failing test asserting all 8 directions are covered**

```typescript
// src/domain/baguaCorrespondences.test.ts
import { describe, it, expect } from 'vitest'
import { baguaCorrespondences } from './baguaCorrespondences'
import type { CompassDirection } from '../geometry/bagua'

describe('baguaCorrespondences', () => {
  it('has an entry for every compass direction, each with a non-empty label and object list', () => {
    const directions: CompassDirection[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    for (const direction of directions) {
      const entry = baguaCorrespondences[direction]
      expect(entry).toBeDefined()
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.correctiveObjects.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/domain/baguaCorrespondences.test.ts`
Expected: FAIL — `Cannot find module './baguaCorrespondences'`

- [ ] **Step 3: Implement `baguaCorrespondences`**

```typescript
// src/domain/baguaCorrespondences.ts
import type { CompassDirection } from '../geometry/bagua'

export interface BaguaCorrespondence {
  label: string
  element: string
  correctiveObjects: string[]
}

// Placeholder values for N/NE/SE/SW/W/NW — cross-reference against the full
// "6 - La grille Pakua" chapter (Polizzi, GQH) before relying on these for a
// real mission report. N/E/S entries below match examples already confirmed
// from that chapter during this feature's design (spec §1/§6).
export const baguaCorrespondences: Record<CompassDirection, BaguaCorrespondence> = {
  N: { label: 'Carrière', element: 'Eau', correctiveObjects: ['fontaine'] },
  NE: { label: 'Connaissance', element: 'Terre', correctiveObjects: ['composition dans un bac à fleurs'] },
  E: { label: 'Famille', element: 'Bois', correctiveObjects: ['plante en pot'] },
  SE: { label: 'Prospérité', element: 'Bois', correctiveObjects: ['plante en pot'] },
  S: { label: 'Renommée', element: 'Feu', correctiveObjects: ['bougie', 'éclairage'] },
  SW: { label: 'Relations', element: 'Terre', correctiveObjects: ['composition dans un bac à fleurs'] },
  W: { label: 'Créativité', element: 'Métal', correctiveObjects: ['objet métallique'] },
  NW: { label: 'Amis utiles', element: 'Métal', correctiveObjects: ['objet métallique'] },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/domain/baguaCorrespondences.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/domain/baguaCorrespondences.ts src/domain/baguaCorrespondences.test.ts
git commit -m "Add baguaCorrespondences: static Pakua sector/element/object reference table"
```

**⚠️ Human checkpoint before this feature ships to real use:** the N/NE/SE/SW/W/NW
labels and objects above are placeholders needing verification against the book's full
Pakua chapter — flag to Laurent.

---

**Chunk 2 exit criteria:** `node_modules/.bin/vitest.cmd run` and
`node_modules/.bin/tsc.cmd -b --noEmit` both pass. The Bagua grid can be computed and
labeled entirely offline, given any building footprint — no map, no Leaflet, no Supabase
involved in this chunk.

---

## Chunk 3: `OverlayPanel` refactor + rendering + `SiteMapView` integration

**Why this chunk is last:** it's the only one touching `SiteMapView.tsx`, the most
contended shared file in the codebase (5 prior tasks — 29 through 33 — have each added a
corner overlay to it). Doing the `OverlayPanel` extraction first, in its own task, means
the actual Bagua wiring (Task 8) lands on a clean abstraction instead of adding a 6th
hand-rolled `*_STYLE` constant.

### Task 6: Extract `OverlayPanel`

**Files:**
- Create: `src/components/OverlayPanel.tsx`
- Test: `src/components/OverlayPanel.test.tsx`
- Modify: `src/components/SiteMapView.tsx` + `.test.tsx` (replace all four `*_STYLE`
  constants and their wrapping `<div>`s with `<OverlayPanel corner="...">`)
- Modify: `src/components/LayerPanel.tsx` (no change expected — it already lost its own
  positioning in Task 33; verify this task doesn't need to touch it)

**This is a refactor of already-tested, already-working code — no new user-visible
behavior.** The four corners' current pixel values (`top: 8`/`bottom: 8`/`left: 8`/
`right: 8`, `zIndex: 1000`, white background, `padding: 8`, `borderRadius: 4`) are
identical across all four `*_STYLE` constants in `SiteMapView.tsx` today (confirmed by
reading the file — only the corner (`top`/`bottom`/`left`/`right` combination) differs).
`TOP_RIGHT_STACK_STYLE` additionally has `display: flex; flexDirection: column; gap: 8;
alignItems: flex-end; maxHeight: calc(100% - 16px); maxWidth: 320; overflowY: auto` — per
spec §6, this stacking/overflow treatment should generalize to all four corners, not stay
top-right-only, since Task 8 below will need to add a second item to another corner too.

- [ ] **Step 1: Write failing tests for `OverlayPanel`**

```tsx
// src/components/OverlayPanel.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OverlayPanel } from './OverlayPanel'

describe('OverlayPanel', () => {
  it('renders its children', () => {
    render(
      <OverlayPanel corner="top-left">
        <p>hello</p>
      </OverlayPanel>
    )
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it.each([
    ['top-left', { top: '8px', left: '8px' }],
    ['top-right', { top: '8px', right: '8px' }],
    ['bottom-left', { bottom: '8px', left: '8px' }],
    ['bottom-right', { bottom: '8px', right: '8px' }],
  ] as const)('positions the %s corner correctly', (corner, expectedStyle) => {
    const { container } = render(
      <OverlayPanel corner={corner}>
        <p>content</p>
      </OverlayPanel>
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.style.position).toBe('absolute')
    for (const [prop, value] of Object.entries(expectedStyle)) {
      expect((root.style as unknown as Record<string, string>)[prop]).toBe(value)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/components/OverlayPanel.test.tsx`
Expected: FAIL — `Cannot find module './OverlayPanel'`

- [ ] **Step 3: Implement `OverlayPanel`**

```tsx
// src/components/OverlayPanel.tsx
import type { ReactNode } from 'react'

export type OverlayCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface OverlayPanelProps {
  corner: OverlayCorner
  children: ReactNode
}

// Consolidates SiteMapView.tsx's four previously hand-duplicated *_STYLE
// constants (GUIDE_LINE_CONTROLS_STYLE, EDIT_CONTROLS_STYLE,
// ORTHOGONALITY_PANEL_STYLE, TOP_RIGHT_STACK_STYLE) into one component.
// position: absolute is required because SiteMapView's own wrapping div is
// position: relative inside a fixed-height parent (MissionWorkspace's
// MAP_WRAPPER_STYLE) — an unpositioned sibling would flow below the map box
// instead of overlaying it (this bug class has been hit and fixed multiple
// times across Tasks 29-33). The flex-column + maxHeight/overflowY
// treatment (previously TOP_RIGHT_STACK_STYLE-only) is generalized to all
// four corners, since more than one corner may need to stack multiple
// panels (this feature adds a second item to at least one corner — see
// Task 8/9).
const CORNER_STYLES: Record<OverlayCorner, { top?: number; bottom?: number; left?: number; right?: number; alignItems: 'flex-start' | 'flex-end' }> = {
  'top-left': { top: 8, left: 8, alignItems: 'flex-start' },
  'top-right': { top: 8, right: 8, alignItems: 'flex-end' },
  'bottom-left': { bottom: 8, left: 8, alignItems: 'flex-start' },
  'bottom-right': { bottom: 8, right: 8, alignItems: 'flex-end' },
}

export function OverlayPanel({ corner, children }: OverlayPanelProps) {
  const cornerStyle = CORNER_STYLES[corner]
  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxHeight: 'calc(100% - 16px)',
        maxWidth: 320,
        overflowY: 'auto',
        ...cornerStyle,
      }}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/components/OverlayPanel.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Replace all four `SiteMapView.tsx` overlay sites with `OverlayPanel`**

Remove `GUIDE_LINE_CONTROLS_STYLE`, `EDIT_CONTROLS_STYLE`, `ORTHOGONALITY_PANEL_STYLE`,
`TOP_RIGHT_STACK_STYLE`, and `GRID_CREATION_WRAPPER_STYLE` (lines 24-109 of the current
file — read the file first to get exact current line numbers, they may have shifted
since this plan was written). Replace each of the four `<div style={...}>` wrapper sites
with `<OverlayPanel corner="...">`, keeping each panel's own content (`LayerPanel` +
`GridCreationPanel` together in `top-right`; the guide-line buttons in `top-left`; the
edit-mode controls in `bottom-left`; the orthogonality preview in `bottom-right`) exactly
as they are today — this step changes only the wrapping, not the contents. Each
individual card inside a corner (e.g. `GridCreationPanel`, which currently gets its own
`GRID_CREATION_WRAPPER_STYLE` white-card treatment) still needs its own
`{ background: 'white', padding: 8, borderRadius: 4 }` wrapper `<div>` — `OverlayPanel`
itself only handles positioning/stacking, not each child's visual chrome (matching
`LayerPanel`'s own `PANEL_STYLE`, which already supplies its own chrome).

Add:
```typescript
import { OverlayPanel } from './OverlayPanel'
```

- [ ] **Step 6: Update `SiteMapView.test.tsx` if any test asserted on the removed style
  constants directly**

Grep the test file for `GUIDE_LINE_CONTROLS_STYLE`, `EDIT_CONTROLS_STYLE`,
`ORTHOGONALITY_PANEL_STYLE`, `TOP_RIGHT_STACK_STYLE` — if none of the existing tests
import or assert on these directly (likely, since they're internal implementation
details), no test changes should be needed here. Confirm by running the suite (next
step) rather than assuming.

- [ ] **Step 7: Run the full suite and type-check**

Run: `node_modules/.bin/vitest.cmd run && node_modules/.bin/tsc.cmd -b --noEmit`
Expected: all pass, no type errors, no test count regression from before this task
(pure refactor — every existing `SiteMapView.test.tsx` test should still pass unmodified
unless Step 6 found otherwise)

- [ ] **Step 8: Commit**

```bash
git add src/components/OverlayPanel.tsx src/components/OverlayPanel.test.tsx src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx
git commit -m "Extract OverlayPanel: consolidate SiteMapView's 4 duplicated corner-overlay styles"
```

---

### Task 7: `BaguaLayer` — Leaflet rendering

**Files:**
- Create: `src/components/BaguaLayer.tsx`
- Test: `src/components/BaguaLayer.test.tsx`

**Same family as `NetworkLinesLayer`/`FeltPointsLayer`/`GuideLineLayer`** — a separate
component because `SiteMapView.test.tsx` mocks every layer down to a stub `<div>` with no
real Leaflet context, so a real `<Polygon>` rendered directly in `SiteMapView`'s JSX would
crash in that test file.

**Must use `baguaCorrespondences` (Task 5), not render 8 visually-identical wedges** —
the spec (§6) explicitly calls for `compassDirection` to be the join key into the
correspondence table so each sector is identifiable on the map, not just in a separate
legend. Attach each wedge's label via a Leaflet `Tooltip` (shown on hover/click, no extra
screen space consumed when not interacted with — appropriate for 8 small polygons on an
already-busy map).

- [ ] **Step 1: Write failing tests for `BaguaLayer`**

```tsx
// src/components/BaguaLayer.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { BaguaLayer } from './BaguaLayer'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }

describe('BaguaLayer', () => {
  it('renders 8 sector polygons', () => {
    const footprint = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
    ]
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <BaguaLayer footprint={footprint} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(8)
  })

  it('labels each sector with its correspondence-table entry on hover', () => {
    // Leaflet's Tooltip (non-permanent, the default) only creates its DOM
    // content once opened via a mouseover/click listener — it's not present
    // in the tree on initial render. Simulate the hover Laurent would
    // actually perform before asserting on the label text.
    const footprint = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
    ]
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <BaguaLayer footprint={footprint} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    const firstPath = container.querySelector('path.leaflet-interactive')!
    firstPath.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))

    // baguaCorrespondences.N.label is 'Carrière' (Task 5) — confirms the
    // tooltip content is actually sourced from the correspondence table,
    // not a hardcoded/generic label. Whichever sector happens to be first
    // in COMPASS_ORDER (N) is the one under test here.
    expect(container.textContent).toContain('Carrière')
  })

  it('renders nothing when footprint is null', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <BaguaLayer footprint={null} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })

  it('renders nothing when visible is false', () => {
    const footprint = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
    ]
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <BaguaLayer footprint={footprint} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/components/BaguaLayer.test.tsx`
Expected: FAIL — `Cannot find module './BaguaLayer'`

- [ ] **Step 3: Implement `BaguaLayer`**

```tsx
// src/components/BaguaLayer.tsx
import { Polygon, Tooltip } from 'react-leaflet'
import { computeCentroid, computeMaxRadius, computeBaguaSectors } from '../geometry/bagua'
import { baguaCorrespondences } from '../domain/baguaCorrespondences'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import type { Point } from '../domain/types'

export interface BaguaLayerProps {
  footprint: Point[] | null
  missionOrigin: LatLng
  visible: boolean
}

export function BaguaLayer({ footprint, missionOrigin, visible }: BaguaLayerProps) {
  if (!visible || footprint === null || footprint.length === 0) return null

  const center = computeCentroid(footprint)
  const radiusM = computeMaxRadius(footprint, center)
  const sectors = computeBaguaSectors(center, radiusM)

  return (
    <>
      {sectors.map((sector) => {
        const correspondence = baguaCorrespondences[sector.compassDirection]
        return (
          <Polygon
            key={sector.compassDirection}
            positions={sector.points.map((p) => {
              const latlng = localToLatLng(p, missionOrigin)
              return [latlng.lat, latlng.lng] as [number, number]
            })}
            pathOptions={{ color: '#7b4fa3', weight: 1, fillOpacity: 0.08 }}
          >
            <Tooltip>{sector.compassDirection} — {correspondence.label}</Tooltip>
          </Polygon>
        )
      })}
    </>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/components/BaguaLayer.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Type-check and commit**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/components/BaguaLayer.tsx src/components/BaguaLayer.test.tsx
git commit -m "Add BaguaLayer: renders the 8-sector Pakua overlay as Leaflet polygons"
```

---

### Task 8: Building-footprint detection, confirmation, and storage — wired into `SiteMapView`

**Files:**
- Create: `src/components/BuildingFootprintPicker.tsx`
- Test: `src/components/BuildingFootprintPicker.test.tsx`
- Modify: `src/components/SiteMapView.tsx` + `.test.tsx`

**Flow (spec §5, steps 1-4):** once the mission has an origin (guaranteed true by the time
`SiteMapView` renders — see `MissionWorkspace.tsx`'s `ready-no-interior` phase), fetch
candidate buildings in a radius around it. If none, widen the search once; if still none,
show a clear message (spec §7). If one or more, show them as selectable outlines on the
map; clicking one confirms it, calls `setBuildingFootprint`, and stores the result on
`Mission`.

**Correction post-revue : fetch/erreur/état vivent dans `SiteMapView`, pas dans le
composant enfant.** Every other layer in this codebase (`NetworkLinesLayer`,
`FeltPointsLayer`, `GuideLineLayer`) is purely presentational — `SiteMapView` owns all
data-fetching in its own top-level `useEffect` and passes already-loaded data down as
props. An earlier draft of this task had `BuildingFootprintPicker` do its own fetching
internally, which broke that convention and — combined with rendering buttons/messages
as direct Leaflet-tree children — reintroduced a layout anti-pattern already identified
and fixed once in this codebase (`OrthogonalitySuggestion.tsx`'s doc comment documents
exactly why control text/buttons were moved out of the `<MapContainer>` tree into an
`OverlayPanel` sibling). Fixed here: `BuildingFootprintPicker` only renders candidate
`<Polygon>`s (map layer, inside `<MapView>`); `SiteMapView` owns the fetch, the
`error`/"no building found" state, and renders the confirm-adjacent UI
("Changer de bâtiment", the no-result message) via `OverlayPanel`, exactly like
`OrthogonalitySuggestion`/`ORTHOGONALITY_PANEL_STYLE` was split in Task 32 and this
plan's own Task 6/9.

- [ ] **Step 1: Write failing tests for `BuildingFootprintPicker`**

```tsx
// src/components/BuildingFootprintPicker.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { BuildingFootprintPicker } from './BuildingFootprintPicker'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const oneCandidate = [
  {
    ringsLatLng: [
      [
        { lat: 48.8566, lng: 2.3522 },
        { lat: 48.8567, lng: 2.3522 },
        { lat: 48.8567, lng: 2.3523 },
        { lat: 48.8566, lng: 2.3523 },
      ],
    ],
  },
]

describe('BuildingFootprintPicker', () => {
  it('renders one polygon per candidate', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <BuildingFootprintPicker
          candidates={oneCandidate}
          confirmedIndex={null}
          missionOrigin={missionOrigin}
          onChoose={vi.fn()}
        />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(1)
  })

  it('calls onChoose with the clicked candidate index', () => {
    const onChoose = vi.fn()
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <BuildingFootprintPicker
          candidates={oneCandidate}
          confirmedIndex={null}
          missionOrigin={missionOrigin}
          onChoose={onChoose}
        />
      </MapContainer>
    )
    const path = container.querySelector('path.leaflet-interactive')!
    path.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onChoose).toHaveBeenCalledWith(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest.cmd run src/components/BuildingFootprintPicker.test.tsx`
Expected: FAIL — `Cannot find module './BuildingFootprintPicker'`

- [ ] **Step 3: Implement `BuildingFootprintPicker`**

```tsx
// src/components/BuildingFootprintPicker.tsx
import { Polygon } from 'react-leaflet'
import type { BuildingFootprint } from '../data/buildingFootprintService'
import type { LatLng } from '../geometry/localCoordinates'

export interface BuildingFootprintPickerProps {
  candidates: BuildingFootprint[]
  confirmedIndex: number | null
  missionOrigin: LatLng
  onChoose: (index: number) => void
}

// Purely presentational — SiteMapView owns fetching, error state, and the
// confirm/"Changer de bâtiment"/no-result UI (rendered via OverlayPanel).
// See this task's note above for why data-fetching does not live here.
export function BuildingFootprintPicker({ candidates, confirmedIndex, onChoose }: BuildingFootprintPickerProps) {
  return (
    <>
      {candidates.map((candidate, index) => (
        <Polygon
          key={index}
          positions={candidate.ringsLatLng[0].map((latlng) => [latlng.lat, latlng.lng] as [number, number])}
          pathOptions={{ color: confirmedIndex === index ? '#2d6a4f' : '#888888', weight: 2 }}
          eventHandlers={{ click: () => onChoose(index) }}
        />
      ))}
    </>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest.cmd run src/components/BuildingFootprintPicker.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Type-check and commit the picker component**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`

```bash
git add src/components/BuildingFootprintPicker.tsx src/components/BuildingFootprintPicker.test.tsx
git commit -m "Add BuildingFootprintPicker: presentational candidate-building layer"
```

- [ ] **Step 6: Wire fetching, error handling, and the confirm UI into `SiteMapView`**

**Read the current `SiteMapView.tsx` and `SiteMapView.test.tsx` in full before editing**
— the exact current props signature, the exact `MissionWorkspace.tsx` call site, and the
exact `SiteMapView.test.tsx` mock setup all need to be threaded through consistently.
`SiteMapView` takes `planId`/`missionOrigin` today, not a full `Mission`; this task needs
`missionId` too (to call `setBuildingFootprint`) and the mission's already-stored
`buildingFootprint` (to skip fetching if one is already confirmed) — thread
`missionId: string` and `initialBuildingFootprint: Point[] | null` through from
`MissionWorkspace.tsx` alongside the existing props, following the same pattern
`missionOrigin` itself already establishes.

```typescript
// src/components/SiteMapView.tsx — add imports
import { BuildingFootprintPicker } from './BuildingFootprintPicker'
import { fetchBuildingsInBounds, type BuildingFootprint } from '../data/buildingFootprintService'
import { setBuildingFootprint } from '../data/missionsRepo'

// ... constants, alongside the existing ones near the top of the file:
// Fixed search radius around the mission origin, mirroring
// DEFAULT_GRID_RADIUS_M's role in createGridForPlan.ts — see spec §4/§7 for
// why bounds come from the origin rather than "selected parcels" (no
// parcel-picker UI exists).
const BUILDING_SEARCH_RADIUS_M = 100
const BUILDING_SEARCH_WIDENED_RADIUS_M = 300
const METERS_PER_DEG_LAT = 111_320

function boundsAround(origin: LatLng, radiusM: number) {
  const degLat = radiusM / METERS_PER_DEG_LAT
  const degLng = radiusM / (METERS_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180))
  return {
    minLat: origin.lat - degLat,
    maxLat: origin.lat + degLat,
    minLng: origin.lng - degLng,
    maxLng: origin.lng + degLng,
  }
}

// ... inside SiteMapView, add state alongside the existing useState calls:
const [buildingFootprint, setBuildingFootprintState] = useState<Point[] | null>(initialBuildingFootprint)
const [buildingCandidates, setBuildingCandidates] = useState<BuildingFootprint[]>([])
const [buildingSearchExhausted, setBuildingSearchExhausted] = useState(false)

// ... a second useEffect (the existing one loads grid instances/lines/felt
// points — keep this one separate, it has its own trigger condition):
//
// Depend on missionOrigin.lat/lng (primitives), NOT the missionOrigin object
// itself. MissionWorkspace.tsx constructs `missionOrigin={{ lat: originLat!,
// lng: originLng! }}` as a fresh object literal on every render (confirmed:
// both its call sites do this, with no memoization) — SiteMapView re-renders
// whenever its parent does, so a `[missionOrigin, ...]` dependency would
// re-fire this effect (and re-hit the IGN WFS endpoint, twice per widen-once
// pass) on every unrelated parent re-render for as long as buildingFootprint
// stays null, not just when the origin actually changes.
useEffect(() => {
  if (buildingFootprint !== null) return // already confirmed, nothing to fetch
  async function loadBuildings() {
    try {
      let found = await fetchBuildingsInBounds(boundsAround(missionOrigin, BUILDING_SEARCH_RADIUS_M))
      if (found.length === 0) {
        found = await fetchBuildingsInBounds(boundsAround(missionOrigin, BUILDING_SEARCH_WIDENED_RADIUS_M))
      }
      setBuildingCandidates(found)
      setBuildingSearchExhausted(found.length === 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  loadBuildings()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- missionOrigin.lat/lng
  // are the real dependency; the missionOrigin object itself is deliberately
  // excluded (see comment above) since it's a fresh reference every render.
}, [missionOrigin.lat, missionOrigin.lng, buildingFootprint])

async function handleChooseBuilding(index: number) {
  try {
    const footprint = buildingCandidates[index].ringsLatLng[0].map((latlng) => latLngToLocal(latlng, missionOrigin))
    const updated = await setBuildingFootprint(missionId, footprint)
    setBuildingFootprintState(updated.buildingFootprint)
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err))
  }
}

function handleChangeBuilding() {
  setBuildingFootprintState(null)
  setBuildingCandidates([])
  setBuildingSearchExhausted(false)
  // The useEffect above re-fires automatically once buildingFootprint becomes
  // null again (it's in the dependency array), re-running the fetch.
}

// ... in the JSX, inside <MapView>, alongside the other layers:
{buildingFootprint === null && (
  <BuildingFootprintPicker
    candidates={buildingCandidates}
    confirmedIndex={null}
    missionOrigin={missionOrigin}
    onChoose={handleChooseBuilding}
  />
)}

// ... a new OverlayPanel, only shown once there's something to say — pick a
// corner not already doubly-occupied; top-left (guide-line controls) is the
// least crowded single-item corner today.
{(buildingFootprint !== null || buildingSearchExhausted) && (
  <OverlayPanel corner="top-left">
    {buildingFootprint !== null && (
      <button onClick={handleChangeBuilding}>Changer de bâtiment</button>
    )}
    {buildingSearchExhausted && buildingFootprint === null && (
      <p>Aucun bâtiment détecté à proximité de l'origine.</p>
    )}
  </OverlayPanel>
)}
```

**Note:** the guide-line controls also live in `top-left` (per Task 6's `OverlayPanel`
refactor, that corner now supports stacking multiple items via flex, same as top-right
already did before this plan). If this ends up visually crowded once both are present
simultaneously, moving the building-footprint panel to whichever corner is least busy at
implementation time is a reasonable adjustment — not a hard requirement of this plan.

- [ ] **Step 7: Write a failing integration test, then make it pass**

```tsx
// append to src/components/SiteMapView.test.tsx
// (adapt the exact mock setup to match this file's established conventions —
// see how gridInstancesRepo/feltPointsRepo are already mocked at the top)
vi.mock('../data/buildingFootprintService')
vi.mock('../data/missionsRepo')

it('shows the building footprint picker when none is stored yet, and confirms one into place', async () => {
  vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
  vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
  vi.mocked(buildingFootprintService.fetchBuildingsInBounds).mockResolvedValue([
    { ringsLatLng: [[{ lat: 48.8566, lng: 2.3522 }, { lat: 48.8567, lng: 2.3522 }, { lat: 48.8567, lng: 2.3523 }]] },
  ])
  vi.mocked(missionsRepo.setBuildingFootprint).mockResolvedValue({
    ...someMissionFixture, // reuse whatever Mission fixture this file already has
    buildingFootprint: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
  })

  const { container } = render(
    <SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />
  )

  await waitFor(() => expect(container.querySelectorAll('path.leaflet-interactive').length).toBeGreaterThan(0))
  const path = container.querySelector('path.leaflet-interactive')!
  path.dispatchEvent(new MouseEvent('click', { bubbles: true }))

  await waitFor(() => expect(missionsRepo.setBuildingFootprint).toHaveBeenCalled())
})

it('shows a clear message when no building is found even after widening the search', async () => {
  vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
  vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
  vi.mocked(buildingFootprintService.fetchBuildingsInBounds).mockResolvedValue([]) // both calls return empty

  render(
    <SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />
  )

  expect(await screen.findByText(/aucun bâtiment détecté/i)).toBeInTheDocument()
  expect(buildingFootprintService.fetchBuildingsInBounds).toHaveBeenCalledTimes(2) // 100m then 300m
})

it('surfaces a French error message when fetching buildings fails', async () => {
  vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
  vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
  vi.mocked(buildingFootprintService.fetchBuildingsInBounds).mockRejectedValue(
    new Error('Impossible de charger les bâtiments : 500')
  )

  render(
    <SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />
  )

  expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les bâtiments : 500')
})
```

Run: `node_modules/.bin/vitest.cmd run src/components/SiteMapView.test.tsx`
Expected: FAIL first (nothing wired), then PASS once Step 6 lands.

Also update `MissionWorkspace.tsx`'s `<SiteMapView>` call site (in the `ready-no-interior`
case) to pass `missionId={phase.mission.id}` and
`initialBuildingFootprint={phase.mission.buildingFootprint}`, and update
`MissionWorkspace.test.tsx`'s `SiteMapView` mock stub if it asserts on specific props.

- [ ] **Step 8: Run the full suite and type-check**

Run: `node_modules/.bin/vitest.cmd run && node_modules/.bin/tsc.cmd -b --noEmit`
Expected: all pass, no type errors

- [ ] **Step 9: Commit**

```bash
git add src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx src/pages/MissionWorkspace.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "Wire BuildingFootprintPicker into SiteMapView: fetch, confirm, error handling, no-result message"
```

---

### Task 9: Wire `BaguaLayer` + legend into `SiteMapView`

**Files:**
- Modify: `src/components/SiteMapView.tsx` + `.test.tsx`

**Flow (spec §5, steps 7-9):** once `buildingFootprint` is set (Task 8), render
`BaguaLayer` as a new toggleable layer alongside the existing grid layers in
`LayerPanel`, and show a collapsed-by-default legend (spec §6: "repliée par défaut") in
its own `OverlayPanel` corner when the Bagua layer is toggled visible.

- [ ] **Step 1: Add a Bagua toggle to `LayerPanel`'s visibility model**

`LayerPanel` today only knows about `FELT_POINTS_LAYER_ID` and `gridLayers` (one entry
per `GridInstance`). Add a second fixed layer id, mirroring `FELT_POINTS_LAYER_ID`'s
pattern:

```typescript
// src/components/LayerPanel.tsx — add alongside FELT_POINTS_LAYER_ID
export const BAGUA_LAYER_ID = 'bagua'
```

Add a checkbox for it in `LayerPanel`'s JSX, defaulting to **hidden** (`?? false`, same
default as grid layers — not `?? true` like felt points, since the Bagua overlay is a
correction-phase tool, not something shown by default during blind sensing). Write a
failing test first in `LayerPanel.test.tsx` (follow that file's existing test structure
exactly — it currently tests the felt-points-checked-by-default / grid-layers-unchecked-
by-default cases the same way), then implement, then confirm it passes.

- [ ] **Step 2: Wire `BaguaLayer` and the legend into `SiteMapView`**

```typescript
// src/components/SiteMapView.tsx
import { BaguaLayer } from './BaguaLayer'
import { BAGUA_LAYER_ID } from './LayerPanel'
import { baguaCorrespondences } from '../domain/baguaCorrespondences'

// ... in the JSX, inside <MapView>, alongside the other layers:
<BaguaLayer footprint={buildingFootprint} missionOrigin={missionOrigin} visible={visibility[BAGUA_LAYER_ID] ?? false} />

// ... a new OverlayPanel for the legend — pick a corner; all four already
// have content (top-right: LayerPanel+GridCreationPanel, top-left:
// guide-line, bottom-left: edit controls, bottom-right: orthogonality).
// OverlayPanel (Task 6) already supports multiple stacked children per
// corner via flex, so stack this into whichever corner is least likely to
// be in simultaneous use with the Bagua legend — bottom-right
// (orthogonality) is the safest pairing, since orthogonality review only
// appears transiently right after a drag, while the Bagua legend is
// viewed at leisure once the layer is toggled on.
{(visibility[BAGUA_LAYER_ID] ?? false) && (
  <OverlayPanel corner="bottom-right">
    <BaguaLegendCollapsed />
  </OverlayPanel>
)}
```

Implement `BaguaLegendCollapsed` as a small inline component (in the same file, or a new
`src/components/BaguaLegend.tsx` if it grows past a few lines — use judgment) that shows
a one-line summary by default ("Bagua : 8 secteurs — voir détails") with a "Détails"
button that expands to the full 8-row table from `baguaCorrespondences`, per spec §6's
"repliée par défaut" requirement.

- [ ] **Step 3: Write a test for the legend's collapsed-by-default behavior**

Add a test to `SiteMapView.test.tsx` asserting that when the Bagua layer is toggled
visible, the legend's summary text appears but the full 8-row correspondence table does
not, until "Détails" is clicked.

- [ ] **Step 4: Run the full suite and type-check**

Run: `node_modules/.bin/vitest.cmd run && node_modules/.bin/tsc.cmd -b --noEmit`
Expected: all pass, no type errors

- [ ] **Step 5: Manually verify in the browser**

Run: `npm run dev`. Reach a mission with an origin set and a building footprint
confirmed (Task 8). Toggle the Bagua layer visible in the layer panel. Expected: 8
purple-tinted wedge polygons appear centered on the building, oriented north-up
regardless of any grid template's own orientation; the legend summary appears in the
bottom-right corner alongside the orthogonality panel without visual collision; clicking
"Détails" expands the full correspondence table.

- [ ] **Step 6: Commit**

```bash
git add src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx src/components/LayerPanel.tsx src/components/LayerPanel.test.tsx
git commit -m "Wire BaguaLayer and its collapsed-by-default legend into SiteMapView's layer panel"
```

---

**Chunk 3 exit criteria:** `node_modules/.bin/vitest.cmd run` and
`node_modules/.bin/tsc.cmd -b --noEmit` both pass. From the map screen, once a mission
has an origin, Laurent can confirm a building's detected footprint, toggle a Bagua layer
showing 8 compass-oriented sectors centered on that building, and see a collapsed
corrective-object legend that expands on demand. Re-selecting the building
("Changer de bâtiment") re-fetches candidates.

---

## Explicitly out of scope (spec §9, unchanged)

- Eight Mansions (Ba Zhai) / any personal-birth-data feng shui method
- Étoiles Volantes (Xuan Kong)
- Extending the Bagua to the parcel/terrain rather than just the building
- Using the confirmed building footprint as a visual aid inside
  `PlanCalibrationTool.tsx` (spec §4's "bénéfice supplémentaire") — flagged as a nice-to-have
  in the spec's user flow (step 5) but **not included as a task in this plan**: it's a
  separate, smaller enhancement to an existing, working tool, not required for the Bagua
  feature itself to function end-to-end. Revisit as its own small follow-up task once
  Chunks 1-3 are live and Laurent has used the footprint-picker in the field — worth
  confirming the auto-detected outline is actually accurate enough to be a useful
  calibration aid before investing in wiring it into `PlanCalibrationTool`.
