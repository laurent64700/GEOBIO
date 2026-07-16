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
