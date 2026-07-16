# Rod Marker Detection (ArUco / js-aruco2) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Laurent calibrate an aerial mission photo, click "Détecter les tiges,"
and have every recognized ArUco marker (per-rod, network-tagged at manufacturing
time) turn into a `FeltPoint` on the map — entirely client-side, no network call.

**Architecture:** A pure geometry/mapping core (affine transform application, raw
detections → real-world network-tagged points) fully unit-tested without any
computer-vision dependency, with the one library-dependent piece (`js-aruco2`
detection itself) isolated in a single thin module. A new UI component wires photo
selection → calibration (reusing `PlanCalibrationTool`) → detection → persistence.

**Tech Stack:** TypeScript, js-aruco2 (npm), Vitest, React, Supabase — all additive
to the existing GEOBIO Plan 1 codebase (`D:\LAURENT PC\GEOBIO`).

**Spec reference:** `docs/superpowers/specs/2026-07-16-rod-marker-detection-design.md`

---

## Chunk 1: Data layer — `rod_marker`, `deleteFeltPoint`, photo calibration storage

### Task 1: `rod_marker` table + repo

**Files:**
- Create: `supabase/migrations/0012_rod_marker.sql`
- Modify: `src/domain/types.ts` (add `RodMarker`)
- Create: `src/data/rodMarkersRepo.ts`
- Test: `src/data/rodMarkersRepo.test.ts`

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/0012_rod_marker.sql
create table rod_marker (
  marker_id integer primary key,
  network_name text not null,
  rod_number integer not null
);
create index rod_marker_network_name_idx on rod_marker(network_name);
```

- [ ] **Step 2: Apply it**

Run: `npx supabase db push`

- [ ] **Step 3: Add the `RodMarker` type**

```typescript
// src/domain/types.ts — add
export interface RodMarker {
  markerId: number
  networkName: string
  rodNumber: number
}
```

- [ ] **Step 4: Write failing tests for `rodMarkersRepo`**

```typescript
// src/data/rodMarkersRepo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRodMarker, listRodMarkers } from './rodMarkersRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('rodMarkersRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a rod marker mapping', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: { marker_id: 101, network_name: 'Hartmann', rod_number: 1 },
      error: null,
    })
    vi.mocked(supabase).from = from

    const marker = await createRodMarker({ markerId: 101, networkName: 'Hartmann', rodNumber: 1 })

    expect(from).toHaveBeenCalledWith('rod_marker')
    expect(chain.insert).toHaveBeenCalledWith({
      marker_id: 101, network_name: 'Hartmann', rod_number: 1,
    })
    expect(marker.networkName).toBe('Hartmann')
  })

  it('lists all rod markers', async () => {
    const { from } = createSupabaseChainMock({
      data: [
        { marker_id: 101, network_name: 'Hartmann', rod_number: 1 },
        { marker_id: 102, network_name: 'Hartmann', rod_number: 1 },
      ],
      error: null,
    })
    vi.mocked(supabase).from = from

    const markers = await listRodMarkers()
    expect(markers).toHaveLength(2)
    expect(markers[0].rodNumber).toBe(1)
  })
})
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npx vitest run src/data/rodMarkersRepo.test.ts`
Expected: FAIL — `Cannot find module './rodMarkersRepo'`

- [ ] **Step 6: Implement `rodMarkersRepo`**

```typescript
// src/data/rodMarkersRepo.ts
import { supabase } from '../lib/supabaseClient'
import type { RodMarker } from '../domain/types'

export interface CreateRodMarkerInput {
  markerId: number
  networkName: string
  rodNumber: number
}

interface RodMarkerRow {
  marker_id: number
  network_name: string
  rod_number: number
}

function mapRowToRodMarker(row: RodMarkerRow): RodMarker {
  return { markerId: row.marker_id, networkName: row.network_name, rodNumber: row.rod_number }
}

export async function createRodMarker(input: CreateRodMarkerInput): Promise<RodMarker> {
  const { data, error } = await supabase
    .from('rod_marker')
    .insert({ marker_id: input.markerId, network_name: input.networkName, rod_number: input.rodNumber })
    .select()
    .single()

  if (error) throw new Error(`Impossible de créer l'association marqueur/réseau : ${error.message}`)
  return mapRowToRodMarker(data as RodMarkerRow)
}

export async function listRodMarkers(): Promise<RodMarker[]> {
  const { data, error } = await supabase.from('rod_marker').select()
  if (error) throw new Error(`Impossible de charger les associations marqueur/réseau : ${error.message}`)
  return (data as RodMarkerRow[]).map(mapRowToRodMarker)
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/data/rodMarkersRepo.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0012_rod_marker.sql src/domain/types.ts src/data/rodMarkersRepo.ts src/data/rodMarkersRepo.test.ts
git commit -m "Add rod_marker table and repo: marker ID -> network + rod mapping"
```

---

### Task 2: `feltPointsRepo.deleteFeltPoint`

**Why:** the spec's "enregistrement direct, correction après coup" flow requires
deleting a wrongly-detected point — this function doesn't exist yet in Plan 1.

**Files:**
- Modify: `src/data/feltPointsRepo.ts` + `.test.ts`

- [ ] **Step 1: Write a failing test**

```typescript
// append to src/data/feltPointsRepo.test.ts
it('deletes a felt point', async () => {
  const { from, chain } = createSupabaseChainMock({ data: null, error: null })
  vi.mocked(supabase).from = from

  await deleteFeltPoint('fp1')

  expect(from).toHaveBeenCalledWith('felt_point')
  expect(chain.eq).toHaveBeenCalledWith('id', 'fp1')
})

it('throws a descriptive French error when deletion fails', async () => {
  const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
  vi.mocked(supabase).from = from

  await expect(deleteFeltPoint('fp1')).rejects.toThrow(
    'Impossible de supprimer le point ressenti : network down'
  )
})
```

Add `delete: vi.fn(() => chain)` to `createSupabaseChainMock` in
`src/test/supabaseMock.ts` (a new chain shape: `.delete().eq()`, resolved via the
mock's existing `then` thenable — no `.single()` needed since a delete returns no row).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/data/feltPointsRepo.test.ts`
Expected: FAIL — `deleteFeltPoint is not a function`

- [ ] **Step 3: Implement `deleteFeltPoint`**

```typescript
// src/data/feltPointsRepo.ts — add
export async function deleteFeltPoint(id: string): Promise<void> {
  const { error } = await supabase.from('felt_point').delete().eq('id', id)
  if (error) throw new Error(`Impossible de supprimer le point ressenti : ${error.message}`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/data/feltPointsRepo.test.ts`
Expected: PASS (5 tests — 3 from before + 2 new)

- [ ] **Step 5: Commit**

```bash
git add src/data/feltPointsRepo.ts src/data/feltPointsRepo.test.ts src/test/supabaseMock.ts
git commit -m "Add deleteFeltPoint"
```

---

### Task 3: Per-photo calibration storage on `mission_photo`

**Why:** each aerial photo needs its own calibration transform (different photo,
different framing/angle each time) — `mission_photo` (Plan 1, Chunk 10) currently
has no `calibration` column, unlike `plan` which already has one for the interior
image.

**Files:**
- Create: `supabase/migrations/0013_mission_photo_calibration.sql`
- Modify: `src/domain/types.ts` (add `calibration` to `MissionPhoto`)
- Modify: `src/data/missionPhotosRepo.ts` + `.test.ts` (add `setPhotoCalibration`)

**Blast radius:** `MissionPhoto` gains a new nullable field — every existing
`MissionPhoto`-shaped fixture needs `calibration: null` added:
- `src/data/missionPhotosRepo.test.ts` — both existing tests' row/expected objects.
- `src/components/MissionPhotosGallery.test.tsx` — both `MissionPhoto` object literals.

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/0013_mission_photo_calibration.sql
alter table mission_photo add column calibration jsonb;
```

- [ ] **Step 2: Apply it**

Run: `npx supabase db push`

- [ ] **Step 3: Extend the `MissionPhoto` type**

```typescript
// src/domain/types.ts — modify MissionPhoto
export interface MissionPhoto {
  id: string
  missionId: string
  imageUrl: string
  calibration: AffineTransform | null
  createdAt: string
}
```

- [ ] **Step 4: Fix the blast-radius fixtures**

Add `calibration: null` to every `MissionPhoto` object literal in
`missionPhotosRepo.test.ts` and `MissionPhotosGallery.test.tsx`, and
`calibration: null` to the corresponding DB row literals in `missionPhotosRepo.test.ts`.

- [ ] **Step 5: Write a failing test for `setPhotoCalibration`**

```typescript
// append to src/data/missionPhotosRepo.test.ts
it('sets a photo\'s calibration transform', async () => {
  const { from, chain } = createSupabaseChainMock({
    data: {
      id: 'mp1', mission_id: 'm1', image_url: 'https://x/a.jpg',
      calibration: { a: 1, b: 0, c: 0, d: 1, e: 5, f: -3 },
      created_at: '2026-07-16T10:00:00Z',
    },
    error: null,
  })
  vi.mocked(supabase.from).mockImplementation(from)

  const photo = await setPhotoCalibration('mp1', { a: 1, b: 0, c: 0, d: 1, e: 5, f: -3 })

  expect(chain.update).toHaveBeenCalledWith({
    calibration: { a: 1, b: 0, c: 0, d: 1, e: 5, f: -3 },
  })
  expect(chain.eq).toHaveBeenCalledWith('id', 'mp1')
  expect(photo.calibration).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 5, f: -3 })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/data/missionPhotosRepo.test.ts`
Expected: FAIL — `setPhotoCalibration is not a function`

- [ ] **Step 7: Implement `setPhotoCalibration`**

```typescript
// src/data/missionPhotosRepo.ts — modify MissionPhotoRow, mapRowToMissionPhoto, add:
interface MissionPhotoRow {
  id: string
  mission_id: string
  image_url: string
  calibration: AffineTransform | null
  created_at: string
}

function mapRowToMissionPhoto(row: MissionPhotoRow): MissionPhoto {
  return {
    id: row.id,
    missionId: row.mission_id,
    imageUrl: row.image_url,
    calibration: row.calibration,
    createdAt: row.created_at,
  }
}

export async function setPhotoCalibration(
  photoId: string,
  calibration: AffineTransform
): Promise<MissionPhoto> {
  const { data, error } = await supabase
    .from('mission_photo')
    .update({ calibration })
    .eq('id', photoId)
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer le calage de la photo : ${error.message}`)
  return mapRowToMissionPhoto(data as MissionPhotoRow)
}
```

Add `import type { AffineTransform } from '../domain/types'` to the file's existing
type-only import line.

- [ ] **Step 8: Run tests to verify they pass, type-check**

Run: `npx vitest run src/data/missionPhotosRepo.test.ts src/components/MissionPhotosGallery.test.tsx && npx tsc -b --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0013_mission_photo_calibration.sql src/domain/types.ts src/data/missionPhotosRepo.ts src/data/missionPhotosRepo.test.ts src/components/MissionPhotosGallery.test.tsx
git commit -m "Add per-photo calibration storage to mission_photo"
```

---

**Chunk 1 exit criteria:** `npx vitest run` and `npx tsc -b --noEmit` both pass. The
data layer this feature needs (`rod_marker`, `deleteFeltPoint`, per-photo
calibration) exists and is tested — nothing user-facing yet.

---

## Chunk 2: Pure logic — apply calibration, map detections to network-tagged points

**Nothing in this chunk touches a detection library.** Both units take detections
as plain data (as if already detected) — fully testable without js-aruco2, matching
the separation established for `arucoDetector.ts` in the spec (§5's "Frontière de
responsabilité").

### Task 4: `applyAffineTransform` — apply a calibration transform to a point

**Why this doesn't exist yet:** `calibratePlan` (Plan 1, Chunk 2 Task 6) computes an
`AffineTransform`, but nothing in Plan 1 ever needed to *apply* it forward
(pixel → real) as a standalone, reusable function — the interior-plan visual overlay
that would consume it was deferred (Plan 1, Chunk 4 Task 16's note on
`Leaflet.DistortableImage`). This detection feature is the first consumer, so the
function needs to exist.

**Files:**
- Create: `src/geometry/affineTransform.ts`
- Test: `src/geometry/affineTransform.test.ts`

**⚠️ Get this exactly right — verified against `calibratePlan`'s actual code, not
assumed:** `calibratePlan` (Plan 1, `src/geometry/calibration.ts`) builds its result
via `return { a, b: -b, c: b, d: a, e: tx, f: ty }` from internal parameters
satisfying `x' = a*x - b*y + tx`, `y' = b*x + a*y + ty`. Substituting the returned
field names back in (`returned.c` holds the internal `b`; `returned.b` holds `-b`
internal) gives the field-level formula this task implements:
`x' = a*x + b*y + e`, `y' = c*x + d*y + f`. This was hand-verified against
`calibratePlan`'s own committed 90°-rotation test case
(`{a:0,b:-1,c:1,d:0,e:10,f:20}`) before writing the test below — do not re-derive a
different formula from first principles (e.g. a generic `[[a,c,e],[b,d,f]]` SVG-style
matrix convention) without re-checking it against that exact case first, since a
plausible-looking but wrong convention will pass code review by "looking reasonable"
while silently misplacing every detected point.

- [ ] **Step 1: Write failing tests**

```typescript
// src/geometry/affineTransform.test.ts
import { describe, it, expect } from 'vitest'
import { applyAffineTransform } from './affineTransform'

describe('applyAffineTransform', () => {
  it('applies a pure translation', () => {
    const result = applyAffineTransform(
      { x: 2, y: 4 },
      { a: 1, b: 0, c: 0, d: 1, e: 5, f: -3 }
    )
    expect(result).toEqual({ x: 7, y: 1 })
  })

  it('applies the exact 90°-rotation transform calibratePlan itself produces (Plan 1, Chunk 2 Task 6)', () => {
    // transform = {a:0,b:-1,c:1,d:0,e:10,f:20} is calibratePlan's own committed
    // test fixture for a 90° rotation, scale 1, translate (10,20).
    const result = applyAffineTransform(
      { x: 5, y: 3 },
      { a: 0, b: -1, c: 1, d: 0, e: 10, f: 20 }
    )
    // x' = 0*5 + (-1)*3 + 10 = 7 ; y' = 1*5 + 0*3 + 20 = 25
    expect(result).toEqual({ x: 7, y: 25 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/geometry/affineTransform.test.ts`
Expected: FAIL — `Cannot find module './affineTransform'`

- [ ] **Step 3: Implement `applyAffineTransform`**

```typescript
// src/geometry/affineTransform.ts
import type { AffineTransform, Point } from '../domain/types'

/**
 * Applies a calibration transform (as produced by `calibratePlan`, Plan 1
 * Chunk 2) to a point — pixel coordinates in, mission-local metric coordinates
 * out. Field convention verified against `calibratePlan`'s own construction:
 * x' = a*x + b*y + e, y' = c*x + d*y + f.
 */
export function applyAffineTransform(point: Point, transform: AffineTransform): Point {
  return {
    x: transform.a * point.x + transform.b * point.y + transform.e,
    y: transform.c * point.x + transform.d * point.y + transform.f,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/geometry/affineTransform.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/geometry/affineTransform.ts src/geometry/affineTransform.test.ts
git commit -m "Add applyAffineTransform: forward-apply a calibration transform to a point"
```

---

### Task 5: `arucoMapping.ts` — raw detections → network-tagged real-world points

**Files:**
- Create: `src/vision/arucoMapping.ts`
- Test: `src/vision/arucoMapping.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/vision/arucoMapping.test.ts
import { describe, it, expect } from 'vitest'
import { mapDetectionsToPoints } from './arucoMapping'
import type { RodMarker } from '../domain/types'

const rodMarkers: RodMarker[] = [
  { markerId: 101, networkName: 'Hartmann', rodNumber: 1 },
  { markerId: 102, networkName: 'Hartmann', rodNumber: 1 },
  { markerId: 201, networkName: 'Curry', rodNumber: 1 },
]

// Pure translation transform for simplicity: real = pixel + (100, 200)
const calibration = { a: 1, b: 0, c: 0, d: 1, e: 100, f: 200 }

describe('mapDetectionsToPoints', () => {
  it('maps each recognized marker to a real-world point tagged with its network', () => {
    const result = mapDetectionsToPoints(
      [
        { markerId: 101, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
        { markerId: 201, corners: [{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 20, y: 10 }] },
      ],
      calibration,
      rodMarkers
    )

    expect(result.totalDetected).toBe(2)
    expect(result.totalRecognized).toBe(2)
    expect(result.recognized).toEqual([
      { networkName: 'Hartmann', x: 105, y: 205 }, // centroid (5,5) + (100,200)
      { networkName: 'Curry', x: 125, y: 205 }, // centroid (25,5) + (100,200)
    ])
  })

  it('skips markers not present in the rod_marker lookup, without crashing', () => {
    const result = mapDetectionsToPoints(
      [{ markerId: 999, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }],
      calibration,
      rodMarkers
    )

    expect(result.totalDetected).toBe(1)
    expect(result.totalRecognized).toBe(0)
    expect(result.recognized).toEqual([])
  })

  it('handles an empty detection list', () => {
    const result = mapDetectionsToPoints([], calibration, rodMarkers)
    expect(result).toEqual({ recognized: [], totalDetected: 0, totalRecognized: 0 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/vision/arucoMapping.test.ts`
Expected: FAIL — `Cannot find module './arucoMapping'`

- [ ] **Step 3: Implement `arucoMapping`**

```typescript
// src/vision/arucoMapping.ts
import { applyAffineTransform } from '../geometry/affineTransform'
import type { AffineTransform, Point, RodMarker } from '../domain/types'

export interface RawMarkerDetection {
  markerId: number
  /** The marker's 4 corners in pixel coordinates, in whatever order the detector returns them. */
  corners: [Point, Point, Point, Point]
}

export interface RecognizedPoint {
  networkName: string
  x: number
  y: number
}

export interface MappingResult {
  recognized: RecognizedPoint[]
  totalDetected: number
  totalRecognized: number
}

function centroid(corners: [Point, Point, Point, Point]): Point {
  return {
    x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
    y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
  }
}

/**
 * Maps raw marker detections to real-world points tagged by network, per
 * spec §5/§6: unrecognized marker IDs (not in `rodMarkers`) are silently
 * skipped for point creation (the caller surfaces the count difference to
 * Laurent — see `RodDetectionPanel`, Task 7), never thrown as an error.
 */
export function mapDetectionsToPoints(
  detections: RawMarkerDetection[],
  calibration: AffineTransform,
  rodMarkers: RodMarker[]
): MappingResult {
  const networkByMarkerId = new Map(rodMarkers.map((m) => [m.markerId, m.networkName]))
  const recognized: RecognizedPoint[] = []

  for (const detection of detections) {
    const networkName = networkByMarkerId.get(detection.markerId)
    if (networkName === undefined) continue

    const real = applyAffineTransform(centroid(detection.corners), calibration)
    recognized.push({ networkName, x: real.x, y: real.y })
  }

  return { recognized, totalDetected: detections.length, totalRecognized: recognized.length }
}
```

- [ ] **Step 4: Run tests to verify they pass, type-check**

Run: `npx vitest run src/vision/arucoMapping.test.ts && npx tsc -b --noEmit`
Expected: PASS (3 tests); no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/vision/arucoMapping.ts src/vision/arucoMapping.test.ts
git commit -m "Add arucoMapping: raw marker detections to network-tagged real-world points"
```

---

**Chunk 2 exit criteria:** `npx vitest run` and `npx tsc -b --noEmit` both pass. The
entire "detections + calibration + lookup table → points" pipeline is implemented
and fully tested, with zero dependency on js-aruco2 or any image/camera input —
Chunk 3 only has to supply real detections to something already proven correct.

---

## Chunk 3: js-aruco2 glue + `RodDetectionPanel` UI

### Task 6: `arucoDetector.ts` — the one module that touches js-aruco2

**⚠️ External API uncertainty, same treatment as Leaflet.DistortableImage/Geoman
and the IGN endpoints elsewhere in this project:** the exact import mechanism and
return shape below are based on published js-aruco2 documentation
(`new AR.Detector({ dictionaryName })`, `detector.detect(width, height, data)`
returning markers with `{id, corners}`), **not confirmed against the installed
package's actual TypeScript types/exports** — verify against
https://github.com/damianofalcioni/js-aruco2 at implementation time. If the real
API differs, only this file needs to change; `arucoMapping.ts` (Chunk 2) never
imports js-aruco2 directly.

**⚠️ Second uncertainty: jsdom's `<canvas>` support.** This function draws the
image to an off-screen canvas to read pixel data — jsdom (Plan 1's default test
environment) does **not** implement real 2D canvas rendering by default;
`getContext('2d')` typically returns `null` unless a polyfill (`canvas` npm
package) is installed, or the test runs in a real browser (Vitest browser mode /
Playwright). This is a genuine environment gap to resolve during implementation,
not something to guess past.

**Files:**
- Create: `src/vision/arucoDetector.ts`
- Test: `src/vision/arucoDetector.test.ts`

- [ ] **Step 1: Install js-aruco2**

Run: `npm install js-aruco2`

- [ ] **Step 2: Implement `detectMarkers`**

```typescript
// src/vision/arucoDetector.ts
// @ts-expect-error — js-aruco2 ships no official TypeScript types as of writing;
// verify this import style against the installed package before removing the
// suppression (it may need `import * as` or a default import instead).
import { AR } from 'js-aruco2'
import type { RawMarkerDetection } from './arucoMapping'
import type { Point } from '../domain/types'

/**
 * Detects ArUco markers in an already-loaded image. Draws the image to an
 * off-screen canvas to obtain raw pixel data, since js-aruco2's detector
 * operates on ImageData, not on an <img> element directly.
 */
export function detectMarkers(image: HTMLImageElement): RawMarkerDetection[] {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error("Impossible d'analyser l'image : contexte de dessin indisponible.")
  }
  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

  const detector = new AR.Detector({ dictionaryName: 'ARUCO' })
  const markers = detector.detect(canvas.width, canvas.height, imageData.data)

  return markers.map((marker: { id: number; corners: Point[] }) => {
    // A marker is detected as a quadrilateral by construction, but this is an
    // unverified external library's output — guard the cast rather than trust
    // it silently, since a malformed corners array would otherwise reach
    // arucoMapping's centroid() and read past the array undetected.
    if (marker.corners.length !== 4) {
      throw new Error(
        `Marqueur ${marker.id} détecté avec ${marker.corners.length} coins au lieu de 4.`
      )
    }
    return {
      markerId: marker.id,
      corners: marker.corners as [Point, Point, Point, Point],
    }
  })
}
```

- [ ] **Step 3: Write a smoke test (not a real-marker accuracy test — see note)**

**⚠️ Compound environment uncertainty, more specific than Task 6's opening note:**
`new Image()` with no `src` set (or given only `width`/`height` constructor args,
which set *display* size, not `naturalWidth`/`naturalHeight`) reports
`naturalWidth`/`naturalHeight` of `0` — and `ctx.getImageData(0, 0, 0, 0)` throws
`IndexSizeError` per the Canvas 2D spec, before the function ever reaches
`detector.detect(...)`. A real, decodable image is needed, not a bare constructor
call — this test uses a tiny inline PNG for that reason.

```typescript
// src/vision/arucoDetector.test.ts
import { describe, it, expect } from 'vitest'
import { detectMarkers } from './arucoDetector'

// A real, minimal 2x2 white PNG (base64) — small enough to inline, but with
// genuine non-zero pixel dimensions once decoded, unlike a bare `new Image()`.
const TINY_WHITE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4AWP4z8DwHwAFEAP/xB+kdgAAAABJRU5ErkJggg=='

describe('detectMarkers', () => {
  it('returns an empty array for a blank white image, without throwing', async () => {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error("échec du chargement de l'image de test"))
      image.src = TINY_WHITE_PNG
    })

    const result = detectMarkers(image)
    expect(result).toEqual([])
  })
})
```

**This test only proves the pipeline doesn't crash on a trivial input** — it does
not validate real marker detection accuracy, which requires real printed markers
and a real photo (per the spec's §8, an explicit non-goal of automated testing).

**Two layers of environment uncertainty can surface here, and they need to be told
apart rather than guessed at together:**
1. **`ctx.getImageData` throwing / `getContext('2d')` returning `null`** — jsdom
   (Plan 1's default test environment) has no real 2D canvas implementation. Fix:
   `npm install --save-dev canvas` (a native Cairo-based polyfill jsdom
   auto-detects for `HTMLCanvasElement`).
2. **`image.naturalWidth`/`naturalHeight` still `0` after `onload` fires, even with
   the `canvas` package installed** — this would mean jsdom's global `Image`/`<img>`
   isn't delegating actual pixel decoding to the `canvas` package the way
   `HTMLCanvasElement` does. If this happens, the pragmatic fix is to move this one
   test file to Vitest's browser mode (a real browser engine, guaranteed-correct
   image decoding) rather than fighting jsdom's `Image` further — this is exactly
   the kind of environment question flagged as open in the spec's §8, and it's
   fine (expected, even) if resolving it takes a real run rather than being
   solvable by reading this plan.

Do not assume either fix in advance — run the test, read the actual failure, and
apply the matching fix from the two above.

- [ ] **Step 4: Run the test, resolve whichever environment issue actually surfaces, then verify it passes**

Run: `npx vitest run src/vision/arucoDetector.test.ts`
Expected: PASS (1 test) — likely after applying one or both fixes from Step 3's note.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/vision/arucoDetector.ts src/vision/arucoDetector.test.ts
git commit -m "Add arucoDetector: js-aruco2 glue for marker detection"
```

---

### Task 7: `RodDetectionPanel` — wire calibration + detection + persistence

**Files:**
- Create: `src/components/RodDetectionPanel.tsx`
- Test: `src/components/RodDetectionPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/RodDetectionPanel.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RodDetectionPanel } from './RodDetectionPanel'
import * as arucoDetector from '../vision/arucoDetector'
import * as arucoMapping from '../vision/arucoMapping'
import * as rodMarkersRepo from '../data/rodMarkersRepo'
import * as missionPhotosRepo from '../data/missionPhotosRepo'
import * as feltPointsRepo from '../data/feltPointsRepo'

vi.mock('../vision/arucoDetector')
vi.mock('../vision/arucoMapping')
vi.mock('../data/rodMarkersRepo')
vi.mock('../data/missionPhotosRepo')
vi.mock('../data/feltPointsRepo')
vi.mock('./PlanCalibrationTool', () => ({
  PlanCalibrationTool: ({ onCalibrated }: { onCalibrated: (c: unknown) => void }) => (
    <button onClick={() => onCalibrated({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })}>simulate-calibrated</button>
  ),
}))

const uncalibratedPhoto = {
  id: 'mp1', missionId: 'm1', imageUrl: 'https://x/a.jpg', calibration: null,
  createdAt: '2026-07-16T10:00:00Z',
}
const calibratedPhoto = { ...uncalibratedPhoto, calibration: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } }

describe('RodDetectionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom's Image doesn't actually load image bytes — stub it so `new Image()`
    // fires onload on the next tick, simulating a successful load.
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_: string) {
          setTimeout(() => this.onload?.(), 0)
        }
      }
    )
  })

  afterEach(() => vi.unstubAllGlobals())

  it('shows PlanCalibrationTool when the photo has no calibration yet', () => {
    render(
      <RodDetectionPanel
        photo={uncalibratedPhoto}
        planId="p1"
        missionOrigin={{ lat: 48.8566, lng: 2.3522 }}
        mapCenter={[48.8566, 2.3522]}
        onCalibrated={vi.fn()}
      />
    )
    expect(screen.getByText('simulate-calibrated')).toBeInTheDocument()
  })

  it('saves the calibration and notifies the parent once calibrated', async () => {
    vi.mocked(missionPhotosRepo.setPhotoCalibration).mockResolvedValue(calibratedPhoto)
    const onCalibrated = vi.fn()

    render(
      <RodDetectionPanel
        photo={uncalibratedPhoto}
        planId="p1"
        missionOrigin={{ lat: 48.8566, lng: 2.3522 }}
        mapCenter={[48.8566, 2.3522]}
        onCalibrated={onCalibrated}
      />
    )
    fireEvent.click(screen.getByText('simulate-calibrated'))

    await waitFor(() =>
      expect(missionPhotosRepo.setPhotoCalibration).toHaveBeenCalledWith('mp1', {
        a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
      })
    )
    expect(onCalibrated).toHaveBeenCalledWith(calibratedPhoto)
  })

  it('shows a "Détecter les tiges" button once calibrated, and runs the full pipeline on click', async () => {
    vi.mocked(arucoDetector.detectMarkers).mockReturnValue([
      { markerId: 101, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
    ])
    vi.mocked(rodMarkersRepo.listRodMarkers).mockResolvedValue([
      { markerId: 101, networkName: 'Hartmann', rodNumber: 1 },
    ])
    vi.mocked(arucoMapping.mapDetectionsToPoints).mockReturnValue({
      recognized: [{ networkName: 'Hartmann', x: 5, y: 5 }],
      totalDetected: 1,
      totalRecognized: 1,
    })
    vi.mocked(feltPointsRepo.createFeltPoint).mockResolvedValue({
      id: 'fp1', planId: 'p1', networkName: 'Hartmann', x: 5, y: 5, createdAt: '2026-07-16T10:00:00Z',
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
      expect(feltPointsRepo.createFeltPoint).toHaveBeenCalledWith({
        planId: 'p1', networkName: 'Hartmann', x: 5, y: 5,
      })
    )
    expect(await screen.findByText('1 marqueurs détectés, 1 reconnus.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/RodDetectionPanel.test.tsx`
Expected: FAIL — `Cannot find module './RodDetectionPanel'`

- [ ] **Step 3: Implement `RodDetectionPanel`**

```tsx
// src/components/RodDetectionPanel.tsx
import { useState } from 'react'
import { PlanCalibrationTool } from './PlanCalibrationTool'
import { detectMarkers } from '../vision/arucoDetector'
import { mapDetectionsToPoints } from '../vision/arucoMapping'
import { listRodMarkers } from '../data/rodMarkersRepo'
import { setPhotoCalibration } from '../data/missionPhotosRepo'
import { createFeltPoint } from '../data/feltPointsRepo'
import type { AffineTransform, MissionPhoto } from '../domain/types'
import type { LatLng } from '../geometry/localCoordinates'

export interface RodDetectionPanelProps {
  photo: MissionPhoto
  planId: string
  missionOrigin: LatLng
  mapCenter: [number, number]
  onCalibrated: (photo: MissionPhoto) => void
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Impossible de charger l'image pour la détection."))
    image.src = url
  })
}

export function RodDetectionPanel({
  photo,
  planId,
  missionOrigin,
  mapCenter,
  onCalibrated,
}: RodDetectionPanelProps) {
  const [detecting, setDetecting] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCalibrated(calibration: AffineTransform) {
    try {
      const updated = await setPhotoCalibration(photo.id, calibration)
      onCalibrated(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

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

      await Promise.all(
        recognized.map((point) =>
          createFeltPoint({ planId, networkName: point.networkName, x: point.x, y: point.y })
        )
      )

      setSummary(`${totalDetected} marqueurs détectés, ${totalRecognized} reconnus.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDetecting(false)
    }
  }

  if (!photo.calibration) {
    return (
      <PlanCalibrationTool
        imageUrl={photo.imageUrl}
        missionOrigin={missionOrigin}
        mapCenter={mapCenter}
        onCalibrated={handleCalibrated}
      />
    )
  }

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {summary && <p>{summary}</p>}
      <button onClick={handleDetect} disabled={detecting}>
        {detecting ? 'Détection en cours…' : 'Détecter les tiges'}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass, type-check**

Run: `npx vitest run src/components/RodDetectionPanel.test.tsx && npx tsc -b --noEmit`
Expected: PASS (3 tests); no type errors.

- [ ] **Step 5: Wire `RodDetectionPanel` into `MissionPhotosGallery`**

Add a way to select a photo from the gallery and open `RodDetectionPanel` for it —
e.g. a "Détecter les tiges" link/button per photo thumbnail that renders
`<RodDetectionPanel photo={photo} planId={...} .../>` in place of (or alongside) the
gallery. `MissionPhotosGallery` currently has no `planId` prop (Plan 1, Chunk 10,
Task 34) — add one, threaded from wherever `MissionPhotosGallery` is rendered in
`MissionWorkspace` (`phase.exteriorPlan.id`, the same value already used for
`SiteMapView`, Plan 1 Chunk 8).

This wiring step is intentionally left as an integration task without full example
code here — by this point in the plan, the pattern (add a prop, pass it down from
`MissionWorkspace`'s phase state, mock the child in that page's tests) has been
demonstrated repeatedly in Plan 1 (e.g. Chunk 8 Task 29 Step 13's `phase.exteriorPlan.id`
threading, and Chunk 10 Task 34 Step 12's `MissionPhotosGallery` wiring itself). Write
the failing test first in `MissionPhotosGallery.test.tsx` and
`MissionWorkspace.test.tsx`, following that established pattern, before writing the
implementation.

- [ ] **Step 6: Manually verify in the browser**

Run: `npm run dev`. Upload an aerial photo, calibrate it, print a test ArUco marker
(dictionary `ARUCO`, any ID) and photograph it, upload that test photo, click
"Détecter les tiges".
Expected: the summary message shows the marker was detected; if its ID isn't yet in
`rod_marker`, it's correctly reported as "détecté" but not "reconnu."

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc -b --noEmit`

```bash
git add src/components/RodDetectionPanel.tsx src/components/RodDetectionPanel.test.tsx src/components/MissionPhotosGallery.tsx src/components/MissionPhotosGallery.test.tsx src/pages/MissionWorkspace.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "Add RodDetectionPanel and wire it into MissionPhotosGallery"
```

---

**Chunk 3 exit criteria:** `npx vitest run` and `npx tsc -b --noEmit` both pass.
Laurent can, from a mission's photo gallery: calibrate an aerial photo, click
"Détecter les tiges," and see recognized markers turn into `FeltPoint`s on the map
— entirely client-side, no network call for the detection step itself.
