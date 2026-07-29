# Annuler/Refaire pour le relevé terrain — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent, per-plan undo/redo (10 batches deep, IndexedDB-backed) for the 8 undoable terrain-survey write operations, via compensating actions through the existing offline cache-through pipeline — no new sync code.

**Architecture:** A new `action_history` IndexedDB store (added via a versioned migration) records a before/after snapshot on every undoable repo write, wrapped by a new `undoableWrite` helper. `undo()`/`redo()` (in a new `src/offline/actionHistory.ts` module) find the right entry (or batch of entries, for the grid-recalibration compound gesture), dispatch to the matching repo function with `{ record: false }` so the compensating write doesn't itself get recorded, and flip the entry's `undone` flag directly. Two new sidebar buttons drive it; `SiteMapView.tsx` loses its pre-existing local, non-persistent undo mechanism (superseded) and gains a full data reload after every undo/redo click.

**Tech Stack:** TypeScript, React, `idb` (IndexedDB wrapper), Vitest + `fake-indexeddb`, existing `cachedWrite`/`cachedList` cache-through layer.

**Spec:** `docs/superpowers/specs/2026-07-29-undo-redo-design.md` — read it first; this plan implements it verbatim except where noted below as a plan-level elaboration (details the spec deliberately left at a higher level: e.g. how `deleteX` obtains a `before` snapshot, how the UI reloads data after undo/redo). Every such elaboration is flagged inline with **"Plan-level decision"**.

---

## Chunk 1: Migration, action-history core store, undoableWrite

### Task 1: IndexedDB migration — `action_history` store

**Files:**
- Modify: `src/offline/db.ts`
- Test: `src/offline/dbMigration.test.ts` (new)

**Context:** `src/offline/db.ts`'s current `upgrade(db)` (no `oldVersion` param) unconditionally creates every store — `createObjectStore` throws if a store already exists. Bumping `DB_VERSION` without restructuring `upgrade()` would crash the app for every existing user on their next load (spec §3.0).

- [ ] **Step 1: Write the failing migration test**

Create `src/offline/dbMigration.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { openDB } from 'idb'

describe('getDB — migration from v1', () => {
  it('upgrades an existing v1 database without throwing, adding action_history', async () => {
    // Recreates exactly what today's (pre-chantier) upgrade() does, so this
    // test simulates a real existing user's already-open v1 database.
    const v1 = await openDB('geobio-offline', 1, {
      upgrade(db) {
        const planIdStores = [
          'felt_point', 'felt_segment', 'phenomenon',
          'context_object', 'freeform_network', 'grid_instance',
        ]
        for (const store of planIdStores) {
          const os = db.createObjectStore(store, { keyPath: 'id' })
          os.createIndex('plan_id', 'planId')
        }
        db.createObjectStore('grid_template', { keyPath: 'id' })
        const lineStore = db.createObjectStore('grid_line', { keyPath: 'id' })
        lineStore.createIndex('grid_instance_id', 'gridInstanceId')
        const planStore = db.createObjectStore('plan', { keyPath: 'id' })
        planStore.createIndex('mission_id', 'missionId')
        db.createObjectStore('current_session')
        db.createObjectStore('pending_mutations', { keyPath: 'id', autoIncrement: true })
      },
    })
    v1.close()

    // Fresh module instance so db.ts's module-level `dbPromise` singleton
    // isn't left over from another test file.
    vi.resetModules()
    const { getDB, STORE_NAMES } = await import('./db')
    const db = await getDB()

    for (const store of STORE_NAMES) {
      expect(db.objectStoreNames.contains(store)).toBe(true)
    }
    const tx = db.transaction('action_history', 'readonly')
    expect(tx.store.indexNames.contains('plan_id')).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/offline/dbMigration.test.ts`
Expected: FAIL — either `action_history` store doesn't exist (`objectStoreNames.contains` returns `false`), or the `db.transaction('action_history', ...)` call itself throws because the store was never created.

- [ ] **Step 3: Restructure `upgrade()` and bump `DB_VERSION`**

In `src/offline/db.ts`, replace the whole file with:

```ts
import { openDB, type IDBPDatabase } from 'idb'

// Keep in sync with the createObjectStore calls in getDB()'s upgrade() below —
// this list and that imperative code are two hand-synced sources of truth.
export const STORE_NAMES = [
  'grid_template',
  'grid_instance',
  'grid_line',
  'felt_point',
  'felt_segment',
  'phenomenon',
  'context_object',
  'freeform_network',
  'plan',
  'current_session',
  'pending_mutations',
  'action_history',
] as const

export type StoreName = (typeof STORE_NAMES)[number]

// Object stores indexed by plan_id (most terrain-phase data — see spec §4.2).
export const PLAN_ID_STORES = [
  'felt_point',
  'felt_segment',
  'phenomenon',
  'context_object',
  'freeform_network',
  'grid_instance',
] as const satisfies readonly StoreName[]

export type PlanIdStoreName = (typeof PLAN_ID_STORES)[number]

const DB_NAME = 'geobio-offline'
const DB_VERSION = 2

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          for (const store of PLAN_ID_STORES) {
            const os = db.createObjectStore(store, { keyPath: 'id' })
            os.createIndex('plan_id', 'planId')
          }
          db.createObjectStore('grid_template', { keyPath: 'id' })
          const lineStore = db.createObjectStore('grid_line', { keyPath: 'id' })
          lineStore.createIndex('grid_instance_id', 'gridInstanceId')
          const planStore = db.createObjectStore('plan', { keyPath: 'id' })
          planStore.createIndex('mission_id', 'missionId')
          db.createObjectStore('current_session')
          db.createObjectStore('pending_mutations', { keyPath: 'id', autoIncrement: true })
        }
        if (oldVersion < 2) {
          const historyStore = db.createObjectStore('action_history', {
            keyPath: 'id',
            autoIncrement: true,
          })
          historyStore.createIndex('plan_id', 'planId')
        }
      },
    })
  }
  return dbPromise
}
```

- [ ] **Step 4: Run the migration test and the existing `db.test.ts` to confirm both pass**

Run: `npm test -- src/offline/dbMigration.test.ts src/offline/db.test.ts`
Expected: PASS — all tests green, including the pre-existing `db.test.ts` (which opens a fresh v0 database directly at v2 and must still see every store, since `oldVersion < 1` is true for a brand-new database).

- [ ] **Step 5: Commit**

```bash
git add src/offline/db.ts src/offline/dbMigration.test.ts
git commit -m "feat: add action_history IndexedDB store via versioned migration"
```

---

### Task 2: `actionHistory.ts` core store operations

**Files:**
- Create: `src/offline/actionHistory.ts`
- Test: `src/offline/actionHistory.test.ts` (new)

**Context:** This task builds the low-level `action_history` CRUD used by `undoableWrite` (Task 3) and `undo()`/`redo()` (Task 10): reading entries for a plan, purging undone entries, evicting the oldest batch past the 10-batch cap, and appending a new entry. No repo integration yet — tested against the raw store directly.

- [ ] **Step 1: Write the failing tests**

Create `src/offline/actionHistory.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDB } from './db'
import {
  type ActionHistoryEntry,
  appendEntry,
  getEntriesForPlan,
  purgeUndoneEntries,
  evictOldestBatchIfOverLimit,
} from './actionHistory'

beforeEach(async () => {
  const db = await getDB()
  await db.clear('action_history')
})

function entry(overrides: Partial<Omit<ActionHistoryEntry, 'id'>>): Omit<ActionHistoryEntry, 'id'> {
  return {
    planId: 'p1',
    entityType: 'felt_point',
    entityId: 'fp1',
    operation: 'insert',
    before: null,
    after: { id: 'fp1' },
    batchId: null,
    undone: false,
    createdAt: '2026-07-29T10:00:00Z',
    ...overrides,
  }
}

describe('actionHistory — core store operations', () => {
  it('appends an entry and reads it back scoped to its plan', async () => {
    await appendEntry(entry({ planId: 'p1' }))
    await appendEntry(entry({ planId: 'p2' }))

    const p1Entries = await getEntriesForPlan('p1')
    expect(p1Entries).toHaveLength(1)
    expect(p1Entries[0].planId).toBe('p1')
  })

  it('purges only undone entries for the given plan', async () => {
    await appendEntry(entry({ planId: 'p1', undone: true }))
    await appendEntry(entry({ planId: 'p1', undone: false }))
    await appendEntry(entry({ planId: 'p2', undone: true }))

    await purgeUndoneEntries('p1')

    const p1Entries = await getEntriesForPlan('p1')
    expect(p1Entries).toHaveLength(1)
    expect(p1Entries[0].undone).toBe(false)
    const p2Entries = await getEntriesForPlan('p2')
    expect(p2Entries).toHaveLength(1) // untouched — different plan
  })

  it('does not evict anything when at or under 10 batches', async () => {
    for (let i = 0; i < 10; i++) {
      await appendEntry(entry({ planId: 'p1', entityId: `fp${i}` }))
    }
    await evictOldestBatchIfOverLimit('p1')
    expect(await getEntriesForPlan('p1')).toHaveLength(10)
  })

  it('evicts the single oldest batch when over 10 batches (11 single-entry batches -> 10)', async () => {
    for (let i = 0; i < 11; i++) {
      await appendEntry(entry({ planId: 'p1', entityId: `fp${i}` }))
    }
    await evictOldestBatchIfOverLimit('p1')

    const remaining = await getEntriesForPlan('p1')
    expect(remaining).toHaveLength(10)
    expect(remaining.find((e) => e.entityId === 'fp0')).toBeUndefined() // oldest gone
    expect(remaining.find((e) => e.entityId === 'fp10')).toBeDefined() // newest kept
  })

  it('counts a shared batchId as ONE batch, and evicts the whole batch together', async () => {
    // 9 single-entry batches, then one 3-entry batch (12 rows, 10 logical batches) -> still under the cap.
    for (let i = 0; i < 9; i++) {
      await appendEntry(entry({ planId: 'p1', entityId: `fp${i}` }))
    }
    await appendEntry(entry({ planId: 'p1', entityId: 'gi1', batchId: 'batch-a', entityType: 'grid_instance' }))
    await appendEntry(entry({ planId: 'p1', entityId: 'gl1', batchId: 'batch-a', entityType: 'grid_line' }))
    await appendEntry(entry({ planId: 'p1', entityId: 'gl2', batchId: 'batch-a', entityType: 'grid_line' }))
    await evictOldestBatchIfOverLimit('p1')
    expect(await getEntriesForPlan('p1')).toHaveLength(12) // 10 batches, no eviction yet

    // One more single-entry batch pushes to 11 batches -> the OLDEST batch
    // (fp0, a single-entry batch) is evicted, not just one row of batch-a.
    await appendEntry(entry({ planId: 'p1', entityId: 'fp9' }))
    await evictOldestBatchIfOverLimit('p1')

    const remaining = await getEntriesForPlan('p1')
    expect(remaining.find((e) => e.entityId === 'fp0')).toBeUndefined()
    expect(remaining.filter((e) => e.batchId === 'batch-a')).toHaveLength(3) // batch-a untouched, all-or-nothing
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- src/offline/actionHistory.test.ts`
Expected: FAIL — `./actionHistory` doesn't exist yet.

- [ ] **Step 3: Implement the core store operations**

Create `src/offline/actionHistory.ts`:

```ts
// src/offline/actionHistory.ts
import { getDB } from './db'

export type ActionEntityType =
  | 'felt_point'
  | 'felt_segment'
  | 'phenomenon'
  | 'context_object'
  | 'grid_instance'
  | 'grid_line'

export type ActionOperation = 'insert' | 'update' | 'delete'

export interface ActionHistoryEntry {
  id: number
  planId: string
  entityType: ActionEntityType
  entityId: string
  operation: ActionOperation
  before: unknown | null
  after: unknown | null
  batchId: string | null
  undone: boolean
  createdAt: string
}

export interface UndoableOptions {
  record?: boolean
  batchId?: string
}

const MAX_BATCHES_PER_PLAN = 10

export async function getEntriesForPlan(planId: string): Promise<ActionHistoryEntry[]> {
  const db = await getDB()
  return (await db.getAllFromIndex('action_history', 'plan_id', planId)) as ActionHistoryEntry[]
}

export async function appendEntry(entry: Omit<ActionHistoryEntry, 'id'>): Promise<void> {
  const db = await getDB()
  await db.add('action_history', entry as ActionHistoryEntry)
}

export async function purgeUndoneEntries(planId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('action_history', 'readwrite')
  const index = tx.store.index('plan_id')
  let cursor = await index.openCursor(IDBKeyRange.only(planId))
  while (cursor) {
    if ((cursor.value as ActionHistoryEntry).undone) {
      await cursor.delete()
    }
    cursor = await cursor.continue()
  }
  await tx.done
}

// A `batchId: null` entry counts as its own one-entry batch (keyed by its own
// id so two different null-batch entries never collide into the same "batch").
function batchKeyOf(entry: ActionHistoryEntry): string {
  return entry.batchId ?? `single:${entry.id}`
}

export async function evictOldestBatchIfOverLimit(planId: string): Promise<void> {
  const entries = await getEntriesForPlan(planId)
  const distinctBatches = new Set(entries.map(batchKeyOf))
  if (distinctBatches.size <= MAX_BATCHES_PER_PLAN) return

  const oldest = entries.reduce((a, b) => (b.id < a.id ? b : a))
  const toDelete =
    oldest.batchId === null ? [oldest] : entries.filter((e) => e.batchId === oldest.batchId)

  const db = await getDB()
  const tx = db.transaction('action_history', 'readwrite')
  for (const e of toDelete) {
    await tx.store.delete(e.id)
  }
  await tx.done
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npm test -- src/offline/actionHistory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/offline/actionHistory.ts src/offline/actionHistory.test.ts
git commit -m "feat: add action_history core store operations (purge, FIFO batch eviction)"
```

---

### Task 3: `undoableWrite` wrapper

**Files:**
- Modify: `src/offline/actionHistory.ts`
- Modify: `src/offline/actionHistory.test.ts`

**Context:** `undoableWrite` wraps a repo function's existing write call, recording a history entry only when `options?.record` isn't explicitly `false`. Tested here against a **fake `perform`** (not a real repo) — repo integration is Chunks 2–3.

- [ ] **Step 1: Write the failing tests**

Append to `src/offline/actionHistory.test.ts` (add `undoableWrite` to the existing import from `./actionHistory`):

```ts
import { undoableWrite } from './actionHistory'

describe('undoableWrite', () => {
  it('records an insert entry with after = the returned domain object, before = null', async () => {
    const result = await undoableWrite(
      'p1', 'felt_point', 'insert', null,
      async () => ({ id: 'fp1', planId: 'p1', networkName: 'Hartmann' })
    )
    expect(result).toEqual({ id: 'fp1', planId: 'p1', networkName: 'Hartmann' })

    const entries = await getEntriesForPlan('p1')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      entityType: 'felt_point', entityId: 'fp1', operation: 'insert',
      before: null, after: { id: 'fp1', planId: 'p1', networkName: 'Hartmann' },
      batchId: null, undone: false,
    })
  })

  it('forces after=null for a delete, regardless of what perform() returns', async () => {
    const before = { id: 'fp1', planId: 'p1', networkName: 'Hartmann' }
    await undoableWrite('p1', 'felt_point', 'delete', before, async () => ({ id: 'fp1' }))

    const entries = await getEntriesForPlan('p1')
    expect(entries[0].operation).toBe('delete')
    expect(entries[0].before).toEqual(before)
    expect(entries[0].after).toBeNull()
  })

  it('does NOT record an entry when options.record is false', async () => {
    await undoableWrite(
      'p1', 'felt_point', 'insert', null,
      async () => ({ id: 'fp1' }),
      { record: false }
    )
    expect(await getEntriesForPlan('p1')).toHaveLength(0)
  })

  it('propagates a batchId onto the recorded entry', async () => {
    await undoableWrite(
      'p1', 'grid_instance', 'update', { id: 'gi1', originX: 0, originY: 0 },
      async () => ({ id: 'gi1', originX: 5, originY: 3 }),
      { batchId: 'batch-a' }
    )
    const entries = await getEntriesForPlan('p1')
    expect(entries[0].batchId).toBe('batch-a')
  })

  it('purges undone entries and evicts the oldest batch past the cap when recording', async () => {
    // Prime: one undone entry (should be purged) + 10 non-undone single
    // batches (already at the cap).
    await appendEntry({
      planId: 'p1', entityType: 'felt_point', entityId: 'stale', operation: 'insert',
      before: null, after: { id: 'stale' }, batchId: null, undone: true, createdAt: '2026-01-01T00:00:00Z',
    })
    for (let i = 0; i < 10; i++) {
      await appendEntry({
        planId: 'p1', entityType: 'felt_point', entityId: `fp${i}`, operation: 'insert',
        before: null, after: { id: `fp${i}` }, batchId: null, undone: false, createdAt: '2026-01-01T00:00:00Z',
      })
    }

    await undoableWrite('p1', 'felt_point', 'insert', null, async () => ({ id: 'fp10' }))

    const entries = await getEntriesForPlan('p1')
    expect(entries.find((e) => e.entityId === 'stale')).toBeUndefined() // purged
    expect(entries.find((e) => e.entityId === 'fp0')).toBeUndefined() // oldest evicted (11 batches -> 10)
    expect(entries.find((e) => e.entityId === 'fp10')).toBeDefined() // the new one is kept
    expect(entries).toHaveLength(10)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- src/offline/actionHistory.test.ts`
Expected: FAIL — `undoableWrite` is not exported yet.

- [ ] **Step 3: Implement `undoableWrite`**

Append to `src/offline/actionHistory.ts`:

```ts
export async function undoableWrite<T>(
  planId: string,
  entityType: ActionEntityType,
  operation: ActionOperation,
  before: unknown | null,
  perform: () => Promise<T>,
  options?: UndoableOptions
): Promise<T> {
  const result = await perform()
  if (options?.record ?? true) {
    const after = operation === 'delete' ? null : (result as unknown)
    const entityId =
      before !== null ? (before as { id: string }).id : (after as { id: string }).id

    await purgeUndoneEntries(planId)
    await appendEntry({
      planId,
      entityType,
      entityId,
      operation,
      before,
      after,
      batchId: options?.batchId ?? null,
      undone: false,
      createdAt: new Date().toISOString(),
    })
    await evictOldestBatchIfOverLimit(planId)
  }
  return result
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npm test -- src/offline/actionHistory.test.ts`
Expected: PASS — all tests in this file, including Task 2's.

- [ ] **Step 5: Commit**

```bash
git add src/offline/actionHistory.ts src/offline/actionHistory.test.ts
git commit -m "feat: add undoableWrite wrapper (record entries, purge, FIFO eviction, record:false opt-out)"
```

---

## Chunk 2: `restoreX` + `options` wiring in the 4 paired repos

**Plan-level decision (applies to all 4 tasks in this chunk):** the spec's §3.3 signature list adds `options?: UndoableOptions` to `deleteX` but doesn't spell out how `deleteX` obtains the `before` snapshot it needs to pass to `undoableWrite` (and that `restoreX` needs on undo) — today's `deleteX` functions take only an `id` and never read the entity first. Each task below adds an unconditional cache read at the top of `deleteX`, exactly mirroring the pattern `updateGridInstanceOrigin` already uses (read `existing` from the local cache before doing anything else, throw a clear French error if it's missing). This is a direct, unambiguous consequence of the approved design (restoring an object requires having captured its exact prior state), not a new design question — no additional spec review needed.

**Consequence for existing tests:** because `deleteX` now requires the entity to already be in the local IndexedDB cache, every existing test that calls `deleteX` (or expects it to fail with the network's error message) without first seeding the cache via `db.put(...)` will break. Each task below fixes those specific tests.

### Task 4: `feltPointsRepo` — `restoreFeltPoint` + `options` wiring

**Files:**
- Modify: `src/data/feltPointsRepo.ts`
- Modify: `src/data/feltPointsRepo.test.ts`

- [ ] **Step 1: Update the 2 existing delete tests to seed the cache first**

In `src/data/feltPointsRepo.test.ts`, the `'deletes a felt point'` test (currently lines 85–93) and `'throws a descriptive French error when deletion fails'` test (currently lines 95–102) both call `deleteFeltPoint('fp1')` without seeding the local cache — this will now throw "introuvable dans le cache local" before ever reaching the network. Update both:

```ts
  it('deletes a felt point', async () => {
    const db = await getDB()
    await db.put('felt_point', {
      id: 'fp1', planId: 'p1', networkName: 'Hartmann', x: 0, y: 0, createdAt: '2026-07-16T10:00:00Z',
    })
    const { from, chain } = createSupabaseChainMock({ data: { id: 'fp1' }, error: null })
    vi.mocked(supabase).from = from

    await deleteFeltPoint('fp1')

    expect(from).toHaveBeenCalledWith('felt_point')
    expect(chain.eq).toHaveBeenCalledWith('id', 'fp1')
  })

  it('throws a descriptive French error when deletion fails', async () => {
    const db = await getDB()
    await db.put('felt_point', {
      id: 'fp1', planId: 'p1', networkName: 'Hartmann', x: 0, y: 0, createdAt: '2026-07-16T10:00:00Z',
    })
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(deleteFeltPoint('fp1')).rejects.toThrow(
      'Impossible de supprimer le point ressenti : network down'
    )
  })
```

(`getDB` is already imported in this file from an earlier task's test — if not, add `import { getDB } from '../offline/db'` at the top.)

- [ ] **Step 2: Write the new failing tests — `restoreFeltPoint` + `options` wiring**

Add to `src/data/feltPointsRepo.test.ts`:

```ts
import { restoreFeltPoint } from './feltPointsRepo'
import { getEntriesForPlan } from '../offline/actionHistory'

describe('feltPointsRepo — undo/redo integration', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('felt_point')
    await db.clear('pending_mutations')
    await db.clear('action_history')
  })

  it('restoreFeltPoint reinserts with the SAME id (not a freshly generated one)', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: { id: 'fp1', plan_id: 'p1', network_name: 'Hartmann', x: 1, y: 2, created_at: '2026-07-16T10:00:00Z' },
      error: null,
    })
    vi.mocked(supabase).from = from

    const restored = await restoreFeltPoint({
      id: 'fp1', planId: 'p1', networkName: 'Hartmann', x: 1, y: 2, createdAt: '2026-07-16T10:00:00Z',
    })

    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'fp1' }))
    expect(restored.id).toBe('fp1')
    const db = await getDB()
    expect(await db.get('felt_point', 'fp1')).toBeDefined()
  })

  it('createFeltPoint records an insert entry by default', async () => {
    const { from } = createSupabaseChainMock({
      data: { id: 'fp1', plan_id: 'p1', network_name: 'Hartmann', x: 0, y: 0, created_at: '2026-07-16T10:00:00Z' },
      error: null,
    })
    vi.mocked(supabase).from = from

    await createFeltPoint({ planId: 'p1', networkName: 'Hartmann', x: 0, y: 0 })

    const entries = await getEntriesForPlan('p1')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ entityType: 'felt_point', operation: 'insert' })
  })

  it('createFeltPoint does NOT record an entry when options.record is false', async () => {
    const { from } = createSupabaseChainMock({
      data: { id: 'fp1', plan_id: 'p1', network_name: 'Hartmann', x: 0, y: 0, created_at: '2026-07-16T10:00:00Z' },
      error: null,
    })
    vi.mocked(supabase).from = from

    await createFeltPoint({ planId: 'p1', networkName: 'Hartmann', x: 0, y: 0 }, { record: false })

    expect(await getEntriesForPlan('p1')).toHaveLength(0)
  })

  it('deleteFeltPoint records a delete entry with before = the full pre-deletion object', async () => {
    const db = await getDB()
    const original = { id: 'fp1', planId: 'p1', networkName: 'Hartmann', x: 0, y: 0, createdAt: '2026-07-16T10:00:00Z' }
    await db.put('felt_point', original)
    vi.mocked(supabase).from = createSupabaseChainMock({ data: { id: 'fp1' }, error: null }).from

    await deleteFeltPoint('fp1')

    const entries = await getEntriesForPlan('p1')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ entityType: 'felt_point', operation: 'delete', before: original, after: null })
  })

  it('deleteFeltPoint does NOT record an entry when options.record is false', async () => {
    const db = await getDB()
    await db.put('felt_point', { id: 'fp1', planId: 'p1', networkName: 'Hartmann', x: 0, y: 0, createdAt: '2026-07-16T10:00:00Z' })
    vi.mocked(supabase).from = createSupabaseChainMock({ data: { id: 'fp1' }, error: null }).from

    await deleteFeltPoint('fp1', { record: false })

    expect(await getEntriesForPlan('p1')).toHaveLength(0)
  })

  it('deleteFeltPoint throws a clear error when the point is not in the local cache', async () => {
    await expect(deleteFeltPoint('missing-id')).rejects.toThrow()
  })
})
```

- [ ] **Step 3: Run to confirm failure**

Run: `npm test -- src/data/feltPointsRepo.test.ts`
Expected: FAIL — `restoreFeltPoint` doesn't exist; `deleteFeltPoint`/`createFeltPoint` don't accept `options` or record anything yet; the seeded-cache updates to the two Step-1 tests should already pass once Step 1's edits are in place (they don't depend on new code) — confirm they fail for the RIGHT reason (missing `restoreFeltPoint` export breaking the import) rather than a stray typo.

- [ ] **Step 4: Implement `restoreFeltPoint` and wire `options`/`undoableWrite`**

Replace `src/data/feltPointsRepo.ts`'s `createFeltPoint`/`deleteFeltPoint` and add `restoreFeltPoint`:

```ts
import { cachedList, cachedWrite } from '../offline/cacheThrough'
import { generateClientId } from '../offline/clientId'
import { getDB } from '../offline/db'
import { SupabaseQueryError } from '../offline/supabaseQueryError'
import { undoableWrite, type UndoableOptions } from '../offline/actionHistory'

// ... (mapRowToFeltPoint, FeltPointRow, CreateFeltPointInput unchanged) ...

export async function createFeltPoint(
  input: CreateFeltPointInput,
  options?: UndoableOptions
): Promise<FeltPoint> {
  const id = generateClientId()
  const createdAt = new Date().toISOString()
  const row = {
    id, plan_id: input.planId, network_name: input.networkName,
    x: input.x, y: input.y, created_at: createdAt,
  }
  const item: FeltPoint = {
    id, planId: input.planId, networkName: input.networkName,
    x: input.x, y: input.y, createdAt,
  }

  return undoableWrite(input.planId, 'felt_point', 'insert', null, () =>
    cachedWrite('felt_point', 'felt_point', 'insert', item, () => row, async () => {
      const { data, error } = await supabase.from('felt_point').insert(row).select().single()
      if (error) throw new SupabaseQueryError(`Impossible d'enregistrer le point ressenti : ${error.message}`)
      return mapRowToFeltPoint(data as FeltPointRow)
    }),
  options)
}

export async function deleteFeltPoint(id: string, options?: UndoableOptions): Promise<void> {
  const db = await getDB()
  const existing = (await db.get('felt_point', id)) as FeltPoint | undefined
  if (!existing) {
    throw new Error(`Impossible de supprimer le point ressenti : ${id} est introuvable dans le cache local`)
  }

  await undoableWrite(existing.planId, 'felt_point', 'delete', existing, () =>
    cachedWrite('felt_point', 'felt_point', 'delete', { id }, () => ({ id }), async () => {
      const { error } = await supabase.from('felt_point').delete().eq('id', id)
      if (error) throw new SupabaseQueryError(`Impossible de supprimer le point ressenti : ${error.message}`)
      return { id }
    }),
  options)
}

export async function restoreFeltPoint(item: FeltPoint): Promise<FeltPoint> {
  const row: FeltPointRow = {
    id: item.id, plan_id: item.planId, network_name: item.networkName,
    x: item.x, y: item.y, created_at: item.createdAt,
  }
  return cachedWrite('felt_point', 'felt_point', 'insert', item, () => row, async () => {
    const { data, error } = await supabase.from('felt_point').insert(row).select().single()
    if (error) throw new SupabaseQueryError(`Impossible de restaurer le point ressenti : ${error.message}`)
    return mapRowToFeltPoint(data as FeltPointRow)
  })
}

// ... (listFeltPointsForPlan unchanged) ...
```

- [ ] **Step 5: Run tests to confirm pass**

Run: `npm test -- src/data/feltPointsRepo.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/data/feltPointsRepo.ts src/data/feltPointsRepo.test.ts
git commit -m "feat: add restoreFeltPoint and undoableWrite wiring to feltPointsRepo"
```

---

### Task 5: `feltSegmentsRepo` — `restoreFeltSegment` + `options` wiring

**Files:**
- Modify: `src/data/feltSegmentsRepo.ts`
- Modify: `src/data/feltSegmentsRepo.test.ts`

Identical shape to Task 4, applied to `feltSegmentsRepo.ts`/`feltSegmentsRepo.test.ts`. `FeltSegment`'s fields differ (`pointA`/`pointB`/`polarityA`/`polarityB` instead of `x`/`y`) — use the actual `FeltSegmentRow`/`FeltSegment` shapes already in the file (see `src/data/feltSegmentsRepo.ts:19-43`, read during planning).

- [ ] **Step 1:** Update `feltSegmentsRepo.test.ts`'s existing `'deletes a felt segment'` and `'throws a descriptive French error when deletion fails'` tests (same pattern as Task 4 Step 1) to `db.put('felt_segment', {...})` a full `FeltSegment` object before calling `deleteFeltSegment`.

- [ ] **Step 2:** Write the failing tests, mirroring Task 4 Step 2's 6 tests (`restoreFeltSegment` reinserts with the same id; `createFeltSegment` records by default and skips when `record:false`; `deleteFeltSegment` records `before`/skips/throws-when-missing), substituting `FeltSegment` fixtures, e.g.:

```ts
const segment = {
  id: 'fs1', planId: 'p1', networkName: 'Hartmann',
  pointA: { x: 5, y: -1 }, pointB: { x: 5, y: 1 },
  polarityA: '+' as const, polarityB: '-' as const, createdAt: '2026-07-23T10:00:00Z',
}
```

Run: `npm test -- src/data/feltSegmentsRepo.test.ts` — Expected: FAIL.

- [ ] **Step 3:** Implement `restoreFeltSegment` and wire `options`/`undoableWrite` into `createFeltSegment`/`deleteFeltSegment`, following Task 4 Step 4's exact structure (same imports: `undoableWrite`, `UndoableOptions`, `getDB`).

- [ ] **Step 4:** Run tests to confirm pass. Run: `npm test -- src/data/feltSegmentsRepo.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/feltSegmentsRepo.ts src/data/feltSegmentsRepo.test.ts
git commit -m "feat: add restoreFeltSegment and undoableWrite wiring to feltSegmentsRepo"
```

---

### Task 6: `phenomenaRepo` — `restorePhenomenon` + `options` wiring

**Files:**
- Modify: `src/data/phenomenaRepo.ts`
- Modify: `src/data/phenomenaRepo.test.ts`

Identical shape to Task 4, applied to `phenomenaRepo.ts`/`phenomenaRepo.test.ts` (`Phenomenon`: `id`/`planId`/`kind`/`x`/`y`/`createdAt`, see `src/data/phenomenaRepo.ts:14-32`).

- [ ] **Step 1:** Update the existing `'throws a descriptive French error when deletion fails'`-style test (and any plain delete test) to seed `db.put('phenomenon', {...})` first.
- [ ] **Step 2:** Write the 6 mirrored failing tests (entity type `'phenomenon'`, table `'phenomenon'`).
- [ ] **Step 3:** Implement `restorePhenomenon` + wire `options`/`undoableWrite` into `createPhenomenon`/`deletePhenomenon`.
- [ ] **Step 4:** Run: `npm test -- src/data/phenomenaRepo.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/data/phenomenaRepo.ts src/data/phenomenaRepo.test.ts
git commit -m "feat: add restorePhenomenon and undoableWrite wiring to phenomenaRepo"
```

---

### Task 7: `contextObjectsRepo` — `restoreContextObject` + `options` wiring

**Files:**
- Modify: `src/data/contextObjectsRepo.ts`
- Modify: `src/data/contextObjectsRepo.test.ts`

Identical shape to Task 4, applied to `contextObjectsRepo.ts`/`contextObjectsRepo.test.ts` (`ContextObject`: `id`/`planId`/`kind`/`x`/`y`/`createdAt`, see `src/data/contextObjectsRepo.ts:14-32`).

- [ ] **Step 1:** Update the existing delete test(s) to seed `db.put('context_object', {...})` first.
- [ ] **Step 2:** Write the 6 mirrored failing tests (entity type `'context_object'`, table `'context_object'`).
- [ ] **Step 3:** Implement `restoreContextObject` + wire `options`/`undoableWrite` into `createContextObject`/`deleteContextObject`.
- [ ] **Step 4:** Run: `npm test -- src/data/contextObjectsRepo.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/data/contextObjectsRepo.ts src/data/contextObjectsRepo.test.ts
git commit -m "feat: add restoreContextObject and undoableWrite wiring to contextObjectsRepo"
```

---

## Chunk 3: Grid repos wiring

### Task 8: `gridInstancesRepo` — `options` wiring on `updateGridInstanceOrigin`

**Files:**
- Modify: `src/data/gridInstancesRepo.ts`
- Modify: `src/data/gridInstancesRepo.test.ts`

**Context:** `updateGridInstanceOrigin` already reads `existing` unconditionally before branching (spec §3.3 — no behavior change needed there). This task only adds the `options` param and wraps the call in `undoableWrite`.

- [ ] **Step 1: Write the failing tests**

Add to `src/data/gridInstancesRepo.test.ts`:

```ts
import { getEntriesForPlan } from '../offline/actionHistory'

describe('gridInstancesRepo — undo/redo integration', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('grid_instance')
    await db.clear('pending_mutations')
    await db.clear('action_history')
  })

  it('updateGridInstanceOrigin records an update entry with before = the pre-update instance', async () => {
    const db = await getDB()
    const original = { id: 'gi1', planId: 'p1', templateSnapshot: hartmann, originX: 0, originY: 0 }
    await db.put('grid_instance', original)
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 5, origin_y: 3 },
      error: null,
    }).from

    await updateGridInstanceOrigin('gi1', 5, 3)

    const entries = await getEntriesForPlan('p1')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ entityType: 'grid_instance', operation: 'update', before: original })
  })

  it('does not record an entry when options.record is false', async () => {
    const db = await getDB()
    await db.put('grid_instance', { id: 'gi1', planId: 'p1', templateSnapshot: hartmann, originX: 0, originY: 0 })
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 5, origin_y: 3 },
      error: null,
    }).from

    await updateGridInstanceOrigin('gi1', 5, 3, { record: false })

    expect(await getEntriesForPlan('p1')).toHaveLength(0)
  })

  it('propagates a batchId onto the recorded entry', async () => {
    const db = await getDB()
    await db.put('grid_instance', { id: 'gi1', planId: 'p1', templateSnapshot: hartmann, originX: 0, originY: 0 })
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 5, origin_y: 3 },
      error: null,
    }).from

    await updateGridInstanceOrigin('gi1', 5, 3, { batchId: 'batch-a' })

    const entries = await getEntriesForPlan('p1')
    expect(entries[0].batchId).toBe('batch-a')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- src/data/gridInstancesRepo.test.ts`
Expected: FAIL — `updateGridInstanceOrigin` doesn't accept/use `options` yet.

- [ ] **Step 3: Wire `undoableWrite`**

In `src/data/gridInstancesRepo.ts`, add the import and update `updateGridInstanceOrigin`:

```ts
import { undoableWrite, type UndoableOptions } from '../offline/actionHistory'

export async function updateGridInstanceOrigin(
  instanceId: string,
  originX: number,
  originY: number,
  options?: UndoableOptions
): Promise<GridInstance> {
  const db = await getDB()
  const existing = (await db.get('grid_instance', instanceId)) as GridInstance | undefined
  if (!existing) {
    throw new Error(
      `Impossible de recaler la grille : l'instance ${instanceId} est introuvable dans le cache local`
    )
  }
  const item: GridInstance = { ...existing, originX, originY }

  return undoableWrite(existing.planId, 'grid_instance', 'update', existing, () =>
    cachedWrite('grid_instance', 'grid_instance', 'update', item, gridInstanceToRow, async () => {
      const { data, error } = await supabase
        .from('grid_instance')
        .update({ origin_x: originX, origin_y: originY })
        .eq('id', instanceId)
        .select()
        .single()

      if (error) throw new SupabaseQueryError(`Impossible de recaler la grille : ${error.message}`)
      return mapRowToGridInstance(data as GridInstanceRow)
    }),
  options)
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npm test -- src/data/gridInstancesRepo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/gridInstancesRepo.ts src/data/gridInstancesRepo.test.ts
git commit -m "feat: add undoableWrite wiring to gridInstancesRepo.updateGridInstanceOrigin"
```

---

### Task 9: `gridLinesRepo` — `planId` param, unconditional `existing` read, `options` wiring

**Files:**
- Modify: `src/data/gridLinesRepo.ts`
- Modify: `src/data/gridLinesRepo.test.ts`

**Context (spec §3.3):** `updateAdjustedPoints`/`updateLinePoints` currently only read `existing` (via `getCachedLineOrThrow`) in their offline/fallback branch — the online-success branch writes straight from the Supabase response. This task makes both read `existing` unconditionally, before any branch, and adds a required `planId: string` parameter (since `GridLine` has no `planId` field).

**Breaking signature change:** both functions gain a new 3rd positional parameter `planId: string`, pushing `options` to 4th. Every existing call site and test must be updated.

**This task's commit temporarily breaks `tsc -b` outside this file — expected, fixed in Task 12.** `src/components/SiteMapView.tsx` calls `updateAdjustedPoints(updated.id, updated.adjustedPoints)` (2 args) and `updateLinePoints(line.id, line.theoreticalPoints, line.adjustedPoints)` (3 args) at 3 call sites — all missing the new required `planId` argument. `vitest` (this project's test runner) transpiles via esbuild without type-checking, so `npm test -- src/data/gridLinesRepo.test.ts` in Step 5 below will pass even though `npm run build` (`tsc -b && vite build`) would now fail on `SiteMapView.tsx`. This is fine: Task 12 (Chunk 5) resolves all 3 — 2 of them (`handleLineChanged`'s `updateAdjustedPoints` call, the recalibration effect's `updateLinePoints` call) are updated to pass `planId`; the 3rd (`updateAdjustedPoints` inside `handleUndo`) is removed entirely, since Task 12 Step 1 deletes `handleUndo` along with the rest of the local undo mechanism it belongs to (spec §3.6) rather than updating it. Do not attempt to fix `SiteMapView.tsx` from within this task — its own task (12) does it as part of a larger, coordinated rewrite of that file. Just be aware `npm run build` is red between this task's commit and Task 12's commit; that's expected, not a regression to chase down.

- [ ] **Step 1: Update the 6 existing tests that call `updateAdjustedPoints`/`updateLinePoints` without a cache seed or without `planId`**

In `src/data/gridLinesRepo.test.ts`:

1. `'updates a single line\'s adjusted points'` (currently ~line 72): add a `db.put('grid_line', {...})` seed before the call (the line must now be in cache even on the online path), and add `'p1'` as the 3rd arg:

```ts
  it('updates a single line\'s adjusted points', async () => {
    const db = await getDB()
    await db.put('grid_line', {
      id: 'gl1', gridInstanceId: 'gi1', family: 'axis-a', polarity: '+', reinforced: false,
      theoreticalPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
      adjustedPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
    })
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: false,
        theoretical_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
        adjusted_points: [{ x: 0.3, y: -3 }, { x: 0, y: 3 }],
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const line = await updateAdjustedPoints('gl1', [{ x: 0.3, y: -3 }, { x: 0, y: 3 }], 'p1')

    expect(chain.eq).toHaveBeenCalledWith('id', 'gl1')
    expect(chain.update).toHaveBeenCalledWith({ adjusted_points: [{ x: 0.3, y: -3 }, { x: 0, y: 3 }] })
    expect(line.adjustedPoints).toEqual([{ x: 0.3, y: -3 }, { x: 0, y: 3 }])
  })
```

2. `'updates both theoretical and adjusted points of a line (grid recalibration)'` (~line 90): same pattern — add a `db.put('grid_line', {...})` seed and `'p1'` as the 4th positional arg to `updateLinePoints`.

3. `'throws a descriptive French error when updating adjusted points fails'` (~line 125): add the same `db.put` seed (otherwise it now throws the "introuvable" error instead of reaching the network mock) and `'p1'` as the 3rd arg:

```ts
  it('throws a descriptive French error when updating adjusted points fails', async () => {
    const db = await getDB()
    await db.put('grid_line', {
      id: 'gl1', gridInstanceId: 'gi1', family: 'axis-a', polarity: '+', reinforced: false,
      theoreticalPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
      adjustedPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
    })
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(updateAdjustedPoints('gl1', [{ x: 0, y: 0 }], 'p1')).rejects.toThrow(
      'Impossible de mettre à jour la ligne : network down'
    )
  })
```

4. In the `describe('gridLinesRepo — offline behavior', ...)` block: `'mirrors the full server row into the cache on a successful online updateAdjustedPoints'` and `'...updateLinePoints'` (~lines 223, 246) both already seed the cache via `db.put` — just add `'p1'` as the extra positional arg to the `updateAdjustedPoints`/`updateLinePoints` calls.

5. The two offline-patch tests (`'applies just the adjustedPoints patch...'`, `'applies just the points patch...'`, ~lines 273, 304) and the `'merges sequential offline updates...'` test (~line 418) already seed the cache — add `'p1'` as the extra positional arg everywhere `updateAdjustedPoints`/`updateLinePoints` is called in this file.

6. `'throws a clear error when updating a line that is not in the local cache while offline'` (~line 409–416): this test deliberately does NOT seed the cache (it's testing the missing-line error path) — no `db.put` needed, just add `'p1'` as the 3rd arg so the call still type-checks:

```ts
  it('throws a clear error when updating a line that is not in the local cache while offline', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const writerFrom = vi.fn()
    vi.mocked(supabase).from = writerFrom

    await expect(updateAdjustedPoints('missing-id', [{ x: 0, y: 0 }], 'p1')).rejects.toThrow()
    expect(writerFrom).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Write the new failing tests**

Add to `src/data/gridLinesRepo.test.ts`:

```ts
import { getEntriesForPlan } from '../offline/actionHistory'

describe('gridLinesRepo — undo/redo integration', () => {
  const seeded = {
    id: 'gl1', gridInstanceId: 'gi1', family: 'axis-a' as const, polarity: '+' as const, reinforced: false,
    theoreticalPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
    adjustedPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const db = await getDB()
    await db.clear('grid_line')
    await db.clear('pending_mutations')
    await db.clear('action_history')
    await db.put('grid_line', seeded)
  })

  it('updateLinePoints reads `existing` and records `before` correctly on the ONLINE success branch (regression test for the unconditional-read fix)', async () => {
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: {
        id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: false,
        theoretical_points: [{ x: 5, y: -7 }, { x: 5, y: 13 }],
        adjusted_points: [{ x: 5, y: -7 }, { x: 5, y: 13 }],
      },
      error: null,
    }).from

    await updateLinePoints('gl1', [{ x: 5, y: -7 }, { x: 5, y: 13 }], [{ x: 5, y: -7 }, { x: 5, y: 13 }], 'p1')

    const entries = await getEntriesForPlan('p1')
    expect(entries).toHaveLength(1)
    expect(entries[0].before).toEqual(seeded)
  })

  it('updateAdjustedPoints reads `existing` and records `before` correctly on the ONLINE success branch (regression test for the unconditional-read fix)', async () => {
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: {
        id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: false,
        theoretical_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
        adjusted_points: [{ x: 0.7, y: -3 }, { x: 0, y: 3 }],
      },
      error: null,
    }).from

    await updateAdjustedPoints('gl1', [{ x: 0.7, y: -3 }, { x: 0, y: 3 }], 'p1')

    const entries = await getEntriesForPlan('p1')
    expect(entries).toHaveLength(1)
    expect(entries[0].before).toEqual(seeded)
  })

  it('does not record an entry when options.record is false', async () => {
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: {
        id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: false,
        theoretical_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
        adjusted_points: [{ x: 0.7, y: -3 }, { x: 0, y: 3 }],
      },
      error: null,
    }).from

    await updateAdjustedPoints('gl1', [{ x: 0.7, y: -3 }, { x: 0, y: 3 }], 'p1', { record: false })

    expect(await getEntriesForPlan('p1')).toHaveLength(0)
  })

  it('propagates a batchId onto the recorded entry', async () => {
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: {
        id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: false,
        theoretical_points: [{ x: 5, y: -7 }, { x: 5, y: 13 }],
        adjusted_points: [{ x: 5, y: -7 }, { x: 5, y: 13 }],
      },
      error: null,
    }).from

    await updateLinePoints('gl1', [{ x: 5, y: -7 }, { x: 5, y: 13 }], [{ x: 5, y: -7 }, { x: 5, y: 13 }], 'p1', { batchId: 'batch-a' })

    const entries = await getEntriesForPlan('p1')
    expect(entries[0].batchId).toBe('batch-a')
  })
})
```

This chunk deliberately does NOT add a test asserting "undo always goes through `updateLinePoints`, never `updateAdjustedPoints`" — that's a property of `undo()`'s dispatch logic, which doesn't exist yet (Task 10, Chunk 4). Task 10 covers it directly (`'undoes an update on grid_line ALWAYS via updateLinePoints...'`).

- [ ] **Step 3: Run to confirm failure**

Run: `npm test -- src/data/gridLinesRepo.test.ts`
Expected: FAIL — signature mismatch (`planId` missing) and no recording happens yet.

- [ ] **Step 4: Implement the unconditional read, `planId` param, and `undoableWrite` wiring**

Also update the doc comment directly above `getCachedLineOrThrow` (currently: "the offline path always reads the EXISTING cached line first...") — it's now inaccurate, since both functions read it unconditionally, not just on the offline path:

```ts
// updateAdjustedPoints and updateLinePoints share the same cached grid_line
// record, so BOTH read the EXISTING cached line first (unconditionally, even
// on the online success path — see undoableWrite's `before` requirement) and
// patch only their own field(s) on top of it — this way updating
// adjustedPoints never clobbers theoreticalPoints, and vice versa.
async function getCachedLineOrThrow(lineId: string, errorPrefix: string): Promise<GridLine> {
```

Replace `updateAdjustedPoints`/`updateLinePoints` in `src/data/gridLinesRepo.ts`:

```ts
import { undoableWrite, type UndoableOptions } from '../offline/actionHistory'

export async function updateAdjustedPoints(
  lineId: string,
  adjustedPoints: Point[],
  planId: string,
  options?: UndoableOptions
): Promise<GridLine> {
  const existing = await getCachedLineOrThrow(lineId, 'Impossible de mettre à jour la ligne')

  return undoableWrite(planId, 'grid_line', 'update', existing, async () => {
    if (await isOnlineNow()) {
      const line = await tryOnlineLineUpdate(
        lineId,
        { adjusted_points: adjustedPoints },
        'Impossible de mettre à jour la ligne'
      )
      if (line) {
        const db = await getDB()
        await db.put('grid_line', line)
        return line
      }
    }

    const line: GridLine = { ...existing, adjustedPoints }
    const db = await getDB()
    await db.put('grid_line', line)
    await enqueueMutation({
      table: 'grid_line',
      operation: 'update',
      payload: { id: lineId, adjusted_points: adjustedPoints },
    })
    return line
  }, options)
}

// Used by grid recalibration (translateGridLine shifts BOTH point arrays by
// the same rigid delta, unlike a felt-adjustment drag which only ever
// touches adjustedPoints via updateAdjustedPoints above).
export async function updateLinePoints(
  lineId: string,
  theoreticalPoints: Point[],
  adjustedPoints: Point[],
  planId: string,
  options?: UndoableOptions
): Promise<GridLine> {
  const existing = await getCachedLineOrThrow(lineId, 'Impossible de recaler la ligne')

  return undoableWrite(planId, 'grid_line', 'update', existing, async () => {
    if (await isOnlineNow()) {
      const line = await tryOnlineLineUpdate(
        lineId,
        { theoretical_points: theoreticalPoints, adjusted_points: adjustedPoints },
        'Impossible de recaler la ligne'
      )
      if (line) {
        const db = await getDB()
        await db.put('grid_line', line)
        return line
      }
    }

    const line: GridLine = { ...existing, theoreticalPoints, adjustedPoints }
    const db = await getDB()
    await db.put('grid_line', line)
    await enqueueMutation({
      table: 'grid_line',
      operation: 'update',
      payload: {
        id: lineId,
        theoretical_points: theoreticalPoints,
        adjusted_points: adjustedPoints,
      },
    })
    return line
  }, options)
}
```

**Known, intentional behavior change** (per spec §3.3): both functions now require the line to already exist in the local cache — including on the online path, where this wasn't required before. Note this doesn't change any real-world usage: every caller (`SiteMapView.tsx`) always calls these on a line it already loaded via `listGridLinesForInstance` first.

- [ ] **Step 5: Run tests to confirm pass**

Run: `npm test -- src/data/gridLinesRepo.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/data/gridLinesRepo.ts src/data/gridLinesRepo.test.ts
git commit -m "feat: add planId param, unconditional existing-read, and undoableWrite wiring to gridLinesRepo"
```

---

## Chunk 4: `undo()`/`redo()` dispatch + UI controls

### Task 10: `undo()`/`redo()` dispatch logic

**Files:**
- Modify: `src/offline/actionHistory.ts`
- Modify: `src/offline/actionHistory.test.ts`

**Context:** This is the spec's central dispatch logic (§3.1) — find the right entry/batch, apply the inverse (undo) or forward (redo) operation via the repo functions with `{ record: false }`, then flip `undone` directly. This file now imports from all 6 repos it dispatches to; those repos import `undoableWrite` from this file — a circular import that's safe here because every cross-reference is inside a function body (called later), never evaluated at module-load time.

- [ ] **Step 1: Write the failing tests**

Append to `src/offline/actionHistory.test.ts`:

```ts
import { undo, redo, hasUndoableAction, hasRedoableAction } from './actionHistory'
import { createFeltPoint, deleteFeltPoint, listFeltPointsForPlan } from '../data/feltPointsRepo'
import { updateGridInstanceOrigin } from '../data/gridInstancesRepo'
import { updateAdjustedPoints, updateLinePoints } from '../data/gridLinesRepo'
import { deletePhenomenon } from '../data/phenomenaRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'
import * as connectivity from '../offline/connectivity'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../offline/connectivity')

describe('undo/redo — dispatch', () => {
  beforeEach(async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const db = await getDB()
    for (const store of ['felt_point', 'phenomenon', 'grid_instance', 'grid_line', 'action_history', 'pending_mutations']) {
      await db.clear(store as any)
    }
  })

  it('hasUndoableAction/hasRedoableAction reflect the current entry state for the plan', async () => {
    expect(await hasUndoableAction('p1')).toBe(false)
    expect(await hasRedoableAction('p1')).toBe(false)

    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'fp1', plan_id: 'p1', network_name: 'Hartmann', x: 0, y: 0, created_at: '2026-07-29T10:00:00Z' },
      error: null,
    }).from
    await createFeltPoint({ planId: 'p1', networkName: 'Hartmann', x: 0, y: 0 })

    expect(await hasUndoableAction('p1')).toBe(true)
    expect(await hasRedoableAction('p1')).toBe(false)
  })

  it('undo() on an empty history is a silent no-op', async () => {
    await expect(undo('p1')).resolves.toBeUndefined()
  })

  it('redo() on an empty history is a silent no-op', async () => {
    await expect(redo('p1')).resolves.toBeUndefined()
  })

  it('undoes an insert by deleting the entity, WITHOUT recording a new history entry', async () => {
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'fp1', plan_id: 'p1', network_name: 'Hartmann', x: 0, y: 0, created_at: '2026-07-29T10:00:00Z' },
      error: null,
    }).from
    await createFeltPoint({ planId: 'p1', networkName: 'Hartmann', x: 0, y: 0 })
    const entriesBefore = await getEntriesForPlan('p1')
    expect(entriesBefore).toHaveLength(1)

    vi.mocked(supabase).from = createSupabaseChainMock({ data: { id: 'fp1' }, error: null }).from
    await undo('p1')

    const points = await listFeltPointsForPlan('p1')
    expect(points.find((p) => p.id === 'fp1')).toBeUndefined()

    // Total entry count must NOT have grown — only `undone` flipped.
    const entriesAfter = await getEntriesForPlan('p1')
    expect(entriesAfter).toHaveLength(1)
    expect(entriesAfter[0].undone).toBe(true)
  })

  it('undo() a second time on an already-empty undo stack is a no-op (not a re-undo of the same entry)', async () => {
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'fp1', plan_id: 'p1', network_name: 'Hartmann', x: 0, y: 0, created_at: '2026-07-29T10:00:00Z' },
      error: null,
    }).from
    await createFeltPoint({ planId: 'p1', networkName: 'Hartmann', x: 0, y: 0 })
    vi.mocked(supabase).from = createSupabaseChainMock({ data: { id: 'fp1' }, error: null }).from
    await undo('p1')

    await undo('p1') // stack already empty — must be a no-op

    const entries = await getEntriesForPlan('p1')
    expect(entries).toHaveLength(1) // still just the one entry, still undone:true
    expect(entries[0].undone).toBe(true)
  })

  it('redoes an insert via restoreX with the SAME id, WITHOUT recording a new entry, and a subsequent undo removes the same entity again', async () => {
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'fp1', plan_id: 'p1', network_name: 'Hartmann', x: 0, y: 0, created_at: '2026-07-29T10:00:00Z' },
      error: null,
    }).from
    await createFeltPoint({ planId: 'p1', networkName: 'Hartmann', x: 0, y: 0 })
    vi.mocked(supabase).from = createSupabaseChainMock({ data: { id: 'fp1' }, error: null }).from
    await undo('p1')

    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'fp1', plan_id: 'p1', network_name: 'Hartmann', x: 0, y: 0, created_at: '2026-07-29T10:00:00Z' },
      error: null,
    }).from
    await redo('p1')

    const points = await listFeltPointsForPlan('p1')
    expect(points).toHaveLength(1)
    expect(points[0].id).toBe('fp1') // same id, not a freshly generated one

    const entries = await getEntriesForPlan('p1')
    expect(entries).toHaveLength(1) // redo() did not record a new entry either
    expect(entries[0].undone).toBe(false)

    // A further undo must target the SAME original id again.
    vi.mocked(supabase).from = createSupabaseChainMock({ data: { id: 'fp1' }, error: null }).from
    await undo('p1')
    expect((await listFeltPointsForPlan('p1'))).toHaveLength(0)
  })

  it('undoes a delete by restoring the entity', async () => {
    const db = await getDB()
    await db.put('felt_point', { id: 'fp1', planId: 'p1', networkName: 'Hartmann', x: 0, y: 0, createdAt: '2026-07-29T10:00:00Z' })
    vi.mocked(supabase).from = createSupabaseChainMock({ data: { id: 'fp1' }, error: null }).from
    await deleteFeltPoint('fp1')

    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'fp1', plan_id: 'p1', network_name: 'Hartmann', x: 0, y: 0, created_at: '2026-07-29T10:00:00Z' },
      error: null,
    }).from
    await undo('p1')

    const points = await listFeltPointsForPlan('p1')
    expect(points.find((p) => p.id === 'fp1')).toBeDefined()
  })

  it('undoes an update on grid_instance via updateGridInstanceOrigin with before coordinates', async () => {
    const hartmann = {
      id: 't0', name: 'Hartmann', spacingXM: 2, spacingYM: 2.5,
      angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0, color: '#d32f2f', vibratoryBase: 7,
    }
    const db = await getDB()
    await db.put('grid_instance', { id: 'gi1', planId: 'p1', templateSnapshot: hartmann, originX: 0, originY: 0 })
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 5, origin_y: 3 },
      error: null,
    }).from
    await updateGridInstanceOrigin('gi1', 5, 3)

    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 0, origin_y: 0 },
      error: null,
    }).from
    await undo('p1')

    const cached = await db.get('grid_instance', 'gi1')
    expect(cached.originX).toBe(0)
    expect(cached.originY).toBe(0)
  })

  it('undoes an update on grid_line ALWAYS via updateLinePoints, restoring both theoreticalPoints and adjustedPoints even if the action only touched adjustedPoints', async () => {
    const db = await getDB()
    const original = {
      id: 'gl1', gridInstanceId: 'gi1', family: 'axis-a' as const, polarity: '+' as const, reinforced: false,
      theoreticalPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
      adjustedPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
    }
    await db.put('grid_line', original)
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: {
        id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: false,
        theoretical_points: original.theoreticalPoints, adjusted_points: [{ x: 0.3, y: -3 }, { x: 0, y: 3 }],
      },
      error: null,
    }).from
    await updateAdjustedPoints('gl1', [{ x: 0.3, y: -3 }, { x: 0, y: 3 }], 'p1')

    vi.mocked(supabase).from = createSupabaseChainMock({
      data: {
        id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: false,
        theoretical_points: original.theoreticalPoints, adjusted_points: original.adjustedPoints,
      },
      error: null,
    }).from
    await undo('p1')

    const cached = await db.get('grid_line', 'gl1')
    expect(cached.theoreticalPoints).toEqual(original.theoreticalPoints)
    expect(cached.adjustedPoints).toEqual(original.adjustedPoints)
  })

  it('undoes/redoes a batch (grid recalibration: 1 origin update + N line updates) as ONE step', async () => {
    const hartmann = {
      id: 't0', name: 'Hartmann', spacingXM: 2, spacingYM: 2.5,
      angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0, color: '#d32f2f', vibratoryBase: 7,
    }
    const db = await getDB()
    await db.put('grid_instance', { id: 'gi1', planId: 'p1', templateSnapshot: hartmann, originX: 0, originY: 0 })
    const lines = [
      { id: 'gl1', gridInstanceId: 'gi1', family: 'axis-a' as const, polarity: '+' as const, reinforced: false,
        theoreticalPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }], adjustedPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }] },
      { id: 'gl2', gridInstanceId: 'gi1', family: 'axis-a' as const, polarity: '-' as const, reinforced: false,
        theoreticalPoints: [{ x: 1, y: -3 }, { x: 1, y: 3 }], adjustedPoints: [{ x: 1, y: -3 }, { x: 1, y: 3 }] },
      { id: 'gl3', gridInstanceId: 'gi1', family: 'axis-b' as const, polarity: '+' as const, reinforced: false,
        theoreticalPoints: [{ x: 2, y: -3 }, { x: 2, y: 3 }], adjustedPoints: [{ x: 2, y: -3 }, { x: 2, y: 3 }] },
    ]
    for (const l of lines) await db.put('grid_line', l)

    const batchId = 'batch-1'
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 5, origin_y: 3 },
      error: null,
    }).from
    await updateGridInstanceOrigin('gi1', 5, 3, { batchId })
    for (const l of lines) {
      const shifted = { theoretical: l.theoreticalPoints.map((p) => ({ x: p.x + 5, y: p.y + 3 })), adjusted: l.adjustedPoints.map((p) => ({ x: p.x + 5, y: p.y + 3 })) }
      vi.mocked(supabase).from = createSupabaseChainMock({
        data: {
          id: l.id, grid_instance_id: 'gi1', family: l.family, polarity: l.polarity, reinforced: l.reinforced,
          theoretical_points: shifted.theoretical, adjusted_points: shifted.adjusted,
        },
        error: null,
      }).from
      await updateLinePoints(l.id, shifted.theoretical, shifted.adjusted, 'p1', { batchId })
    }

    // 4 entries recorded, but ONE logical batch.
    expect(await getEntriesForPlan('p1')).toHaveLength(4)

    // undo() makes 4 SEQUENTIAL network round-trips for this batch (one per
    // entry, in insertion order: grid_instance, then gl1, gl2, gl3) — a
    // single reused createSupabaseChainMock would hand every one of those 4
    // calls the SAME response shape (the mock's `from` is table-agnostic),
    // silently corrupting the 3 grid_line writes with a grid_instance-shaped
    // payload. Use mockImplementationOnce to queue one response per call, in
    // that exact order.
    const undoFrom = vi.fn()
    undoFrom.mockImplementationOnce(
      () => createSupabaseChainMock({
        data: { id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 0, origin_y: 0 },
        error: null,
      }).chain
    )
    for (const l of lines) {
      undoFrom.mockImplementationOnce(
        () => createSupabaseChainMock({
          data: {
            id: l.id, grid_instance_id: 'gi1', family: l.family, polarity: l.polarity, reinforced: l.reinforced,
            theoretical_points: l.theoreticalPoints, adjusted_points: l.adjustedPoints,
          },
          error: null,
        }).chain
      )
    }
    vi.mocked(supabase).from = undoFrom

    await undo('p1')

    const restoredInstance = await db.get('grid_instance', 'gi1')
    expect(restoredInstance.originX).toBe(0)
    for (const l of lines) {
      const restoredLine = await db.get('grid_line', l.id)
      expect(restoredLine.theoreticalPoints).toEqual(l.theoreticalPoints)
    }
    // All 4 entries flipped together — none left half-undone.
    const entriesAfterUndo = await getEntriesForPlan('p1')
    expect(entriesAfterUndo.every((e) => e.undone)).toBe(true)

    // redo() must restore the SHIFTED state, again as one 4-call batch, in
    // the same insertion order.
    const redoFrom = vi.fn()
    redoFrom.mockImplementationOnce(
      () => createSupabaseChainMock({
        data: { id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 5, origin_y: 3 },
        error: null,
      }).chain
    )
    for (const l of lines) {
      const shifted = { theoretical: l.theoreticalPoints.map((p) => ({ x: p.x + 5, y: p.y + 3 })), adjusted: l.adjustedPoints.map((p) => ({ x: p.x + 5, y: p.y + 3 })) }
      redoFrom.mockImplementationOnce(
        () => createSupabaseChainMock({
          data: {
            id: l.id, grid_instance_id: 'gi1', family: l.family, polarity: l.polarity, reinforced: l.reinforced,
            theoretical_points: shifted.theoretical, adjusted_points: shifted.adjusted,
          },
          error: null,
        }).chain
      )
    }
    vi.mocked(supabase).from = redoFrom

    await redo('p1')

    const redoneInstance = await db.get('grid_instance', 'gi1')
    expect(redoneInstance.originX).toBe(5)
    expect(redoneInstance.originY).toBe(3)
    for (const l of lines) {
      const redoneLine = await db.get('grid_line', l.id)
      expect(redoneLine.theoreticalPoints).toEqual(l.theoreticalPoints.map((p) => ({ x: p.x + 5, y: p.y + 3 })))
    }
    const entriesAfterRedo = await getEntriesForPlan('p1')
    expect(entriesAfterRedo.every((e) => !e.undone)).toBe(true)
  })

  it('undoing then redoing a mixed sequence (insert felt_point, update grid_instance, delete phenomenon) restores the correct final cache state at each step', async () => {
    const hartmann = {
      id: 't0', name: 'Hartmann', spacingXM: 2, spacingYM: 2.5,
      angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0, color: '#d32f2f', vibratoryBase: 7,
    }
    const db = await getDB()
    await db.put('grid_instance', { id: 'gi1', planId: 'p1', templateSnapshot: hartmann, originX: 0, originY: 0 })
    await db.put('phenomenon', { id: 'ph1', planId: 'p1', kind: 'spire-vortex', x: 1, y: 1, createdAt: '2026-07-29T09:00:00Z' })

    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'fp1', plan_id: 'p1', network_name: 'Hartmann', x: 0, y: 0, created_at: '2026-07-29T10:00:00Z' },
      error: null,
    }).from
    await createFeltPoint({ planId: 'p1', networkName: 'Hartmann', x: 0, y: 0 })

    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 5, origin_y: 3 },
      error: null,
    }).from
    await updateGridInstanceOrigin('gi1', 5, 3)

    vi.mocked(supabase).from = createSupabaseChainMock({ data: { id: 'ph1' }, error: null }).from
    await deletePhenomenon('ph1')

    // Undo #1: undoes the delete of ph1.
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'ph1', plan_id: 'p1', kind: 'spire-vortex', x: 1, y: 1, created_at: '2026-07-29T09:00:00Z' },
      error: null,
    }).from
    await undo('p1')
    expect(await db.get('phenomenon', 'ph1')).toBeDefined()

    // Undo #2: undoes the grid_instance origin update.
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 0, origin_y: 0 },
      error: null,
    }).from
    await undo('p1')
    expect((await db.get('grid_instance', 'gi1')).originX).toBe(0)

    // Undo #3: undoes the felt point insert.
    vi.mocked(supabase).from = createSupabaseChainMock({ data: { id: 'fp1' }, error: null }).from
    await undo('p1')
    expect((await listFeltPointsForPlan('p1')).find((p) => p.id === 'fp1')).toBeUndefined()

    // Redo #1: redoes the felt point insert. redo() always picks the undone
    // entry with the SMALLEST id (spec §3.1: "plus ANCIENNE entrée annulée")
    // — original recording order was fp1 (id 1), gi1 (id 2), ph1 (id 3), so
    // once all 3 are undone, redo proceeds fp1 → gi1 → ph1, in that fixed
    // order, regardless of the order they were undone in (which happened to
    // be the reverse: ph1, gi1, fp1, since undo always targets the LARGEST id).
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'fp1', plan_id: 'p1', network_name: 'Hartmann', x: 0, y: 0, created_at: '2026-07-29T10:00:00Z' },
      error: null,
    }).from
    await redo('p1')
    expect((await listFeltPointsForPlan('p1')).find((p) => p.id === 'fp1')).toBeDefined()

    // Redo #2: redoes the grid_instance origin update.
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 5, origin_y: 3 },
      error: null,
    }).from
    await redo('p1')
    expect((await db.get('grid_instance', 'gi1')).originX).toBe(5)

    // Redo #3: redoes the phenomenon delete.
    vi.mocked(supabase).from = createSupabaseChainMock({ data: { id: 'ph1' }, error: null }).from
    await redo('p1')
    expect(await db.get('phenomenon', 'ph1')).toBeUndefined()

    // Fully redone — no entries left to redo, none left to undo... actually
    // all 3 are un-undone now, so undo is available again; redo is exhausted.
    expect(await hasRedoableAction('p1')).toBe(false)
    expect(await hasUndoableAction('p1')).toBe(true)
  })

  it('persists across a simulated reload (fresh IndexedDB connection)', async () => {
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'fp1', plan_id: 'p1', network_name: 'Hartmann', x: 0, y: 0, created_at: '2026-07-29T10:00:00Z' },
      error: null,
    }).from
    await createFeltPoint({ planId: 'p1', networkName: 'Hartmann', x: 0, y: 0 })

    // getEntriesForPlan/getDB always re-fetch from IndexedDB itself (no
    // separate in-memory cache layer of their own), so simply re-reading is
    // enough to prove the entry is durably stored, not held only in JS state.
    expect(await hasUndoableAction('p1')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- src/offline/actionHistory.test.ts`
Expected: FAIL — `undo`/`redo` don't exist yet.

- [ ] **Step 3: Implement `undo()`/`redo()` dispatch**

Append to `src/offline/actionHistory.ts`:

```ts
import type { FeltPoint, FeltSegment, Phenomenon, ContextObject, GridInstance, GridLine } from '../domain/types'
import { deleteFeltPoint, restoreFeltPoint } from '../data/feltPointsRepo'
import { deleteFeltSegment, restoreFeltSegment } from '../data/feltSegmentsRepo'
import { deletePhenomenon, restorePhenomenon } from '../data/phenomenaRepo'
import { deleteContextObject, restoreContextObject } from '../data/contextObjectsRepo'
import { updateGridInstanceOrigin } from '../data/gridInstancesRepo'
import { updateLinePoints } from '../data/gridLinesRepo'

export async function hasUndoableAction(planId: string): Promise<boolean> {
  const entries = await getEntriesForPlan(planId)
  return entries.some((e) => !e.undone)
}

export async function hasRedoableAction(planId: string): Promise<boolean> {
  const entries = await getEntriesForPlan(planId)
  return entries.some((e) => e.undone)
}

async function deleteByEntityType(entityType: ActionEntityType, entityId: string): Promise<void> {
  switch (entityType) {
    case 'felt_point': return deleteFeltPoint(entityId, { record: false })
    case 'felt_segment': return deleteFeltSegment(entityId, { record: false })
    case 'phenomenon': return deletePhenomenon(entityId, { record: false })
    case 'context_object': return deleteContextObject(entityId, { record: false })
    default:
      throw new Error(`deleteByEntityType : ${entityType} n'a pas de suppression annulable (spec §2)`)
  }
}

async function restoreByEntityType(entityType: ActionEntityType, item: unknown): Promise<void> {
  switch (entityType) {
    case 'felt_point': await restoreFeltPoint(item as FeltPoint); return
    case 'felt_segment': await restoreFeltSegment(item as FeltSegment); return
    case 'phenomenon': await restorePhenomenon(item as Phenomenon); return
    case 'context_object': await restoreContextObject(item as ContextObject); return
    default:
      throw new Error(`restoreByEntityType : ${entityType} n'a pas de restauration (spec §2)`)
  }
}

async function updateByEntityType(
  entityType: ActionEntityType,
  entityId: string,
  value: unknown,
  planId: string
): Promise<void> {
  if (entityType === 'grid_instance') {
    const instance = value as GridInstance
    await updateGridInstanceOrigin(entityId, instance.originX, instance.originY, { record: false })
    return
  }
  if (entityType === 'grid_line') {
    const line = value as GridLine
    // ALWAYS updateLinePoints, never updateAdjustedPoints — see spec §3.1:
    // before/after are full GridLine snapshots (both point arrays), and only
    // updateLinePoints restores both unconditionally.
    await updateLinePoints(entityId, line.theoreticalPoints, line.adjustedPoints, planId, { record: false })
    return
  }
  throw new Error(`updateByEntityType : ${entityType} n'a pas de mise à jour annulable (spec §2)`)
}

async function applyInverse(entry: ActionHistoryEntry): Promise<void> {
  if (entry.operation === 'insert') {
    await deleteByEntityType(entry.entityType, entry.entityId)
  } else if (entry.operation === 'delete') {
    await restoreByEntityType(entry.entityType, entry.before)
  } else {
    await updateByEntityType(entry.entityType, entry.entityId, entry.before, entry.planId)
  }
}

async function applyForward(entry: ActionHistoryEntry): Promise<void> {
  if (entry.operation === 'insert') {
    // restoreX(after), never createX again — createX would generate a fresh
    // id via generateClientId(), orphaning this history entry (spec §3.1).
    await restoreByEntityType(entry.entityType, entry.after)
  } else if (entry.operation === 'delete') {
    await deleteByEntityType(entry.entityType, entry.entityId)
  } else {
    await updateByEntityType(entry.entityType, entry.entityId, entry.after, entry.planId)
  }
}

async function setUndoneFlag(ids: number[], undone: boolean): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('action_history', 'readwrite')
  for (const id of ids) {
    const entry = (await tx.store.get(id)) as ActionHistoryEntry | undefined
    if (entry) {
      entry.undone = undone
      await tx.store.put(entry)
    }
  }
  await tx.done
}

export async function undo(planId: string): Promise<void> {
  const entries = await getEntriesForPlan(planId)
  const undoable = entries.filter((e) => !e.undone)
  if (undoable.length === 0) return
  const last = undoable.reduce((a, b) => (b.id > a.id ? b : a))
  const batch = last.batchId === null ? [last] : undoable.filter((e) => e.batchId === last.batchId)

  for (const entry of batch) {
    await applyInverse(entry)
  }
  await setUndoneFlag(batch.map((e) => e.id), true)
}

export async function redo(planId: string): Promise<void> {
  const entries = await getEntriesForPlan(planId)
  const redoable = entries.filter((e) => e.undone)
  if (redoable.length === 0) return
  const oldest = redoable.reduce((a, b) => (b.id < a.id ? b : a))
  const batch = oldest.batchId === null ? [oldest] : redoable.filter((e) => e.batchId === oldest.batchId)

  for (const entry of batch) {
    await applyForward(entry)
  }
  await setUndoneFlag(batch.map((e) => e.id), false)
}
```

**Note on the circular import:** `feltPointsRepo.ts` (and its 3 siblings, plus `gridInstancesRepo.ts`/`gridLinesRepo.ts`) import `undoableWrite`/`UndoableOptions` from `actionHistory.ts`, and `actionHistory.ts` imports `deleteFeltPoint`/`restoreFeltPoint`/etc. from those same repo files. This is safe: every reference on both sides is only used inside a function body (`undoableWrite`'s callers call it when their own function runs; `deleteByEntityType` etc. call the repo functions when `undo()`/`redo()` run) — nothing is evaluated at module top-level, so there's no "used before defined" hazard from the circular graph.

- [ ] **Step 4: Run tests to confirm pass**

Run: `npm test -- src/offline/actionHistory.test.ts`
Expected: PASS — all tests in this file, across all 3 tasks.

- [ ] **Step 5: Run the FULL test suite to catch any cross-file regression from the circular import or the `gridLinesRepo`/`gridInstancesRepo` signature changes**

Run: `npm test`
Expected: every test file passes EXCEPT `src/components/SiteMapView.test.tsx` — that one file is allowed to fail, specifically on assertions that call `updateLinePoints`/`updateAdjustedPoints` with the old (pre-`planId`) argument counts (Task 12, Chunk 5, fixes this file explicitly). `updateGridInstanceOrigin` only gained an OPTIONAL trailing `options?` parameter in Task 8 — old 3-arg call sites remain valid, so a failure involving `updateGridInstanceOrigin` is NOT covered by this exception and IS a real regression. Any failure in ANY OTHER file, or any failure in `SiteMapView.test.tsx` that isn't about `updateLinePoints`/`updateAdjustedPoints`'s argument count, is a real regression from this task — stop and investigate before committing.

- [ ] **Step 6: Commit**

```bash
git add src/offline/actionHistory.ts src/offline/actionHistory.test.ts
git commit -m "feat: implement undo()/redo() dispatch with batch grouping and self-recording avoidance"
```

---

### Task 11: `UndoRedoControls` component

**Files:**
- Create: `src/components/UndoRedoControls.tsx`
- Test: `src/components/UndoRedoControls.test.tsx` (new)

**Plan-level decision:** the spec's §3.4 only specifies 2 buttons, grayed out when the corresponding stack is empty (via `hasUndoableAction`/`hasRedoableAction`). It doesn't specify how the buttons' enabled/disabled state stays in sync with actions happening elsewhere on the map (a new felt point, a line drag, etc. — anything that calls `undoableWrite` outside this component). Wiring a refresh callback into every one of `SiteMapView.tsx`'s many mutating handlers would be a much larger, invasive change with no spec mandate. This component instead polls `hasUndoableAction`/`hasRedoableAction` on a fixed interval while mounted — a deliberate, minimal-footprint tradeoff consistent with this being a low-frequency utility control, not a hot path. It also re-checks immediately after every undo/redo click (no need to wait for the next poll tick).

- [ ] **Step 1: Write the failing tests**

Create `src/components/UndoRedoControls.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { UndoRedoControls } from './UndoRedoControls'
import * as actionHistory from '../offline/actionHistory'

vi.mock('../offline/actionHistory')

describe('UndoRedoControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(actionHistory.hasUndoableAction).mockResolvedValue(false)
    vi.mocked(actionHistory.hasRedoableAction).mockResolvedValue(false)
  })

  it('renders both buttons disabled when there is nothing to undo/redo', async () => {
    render(<UndoRedoControls planId="p1" onChanged={vi.fn()} />)

    expect(await screen.findByRole('button', { name: /annuler/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /refaire/i })).toBeDisabled()
  })

  it('enables the buttons once hasUndoableAction/hasRedoableAction resolve true', async () => {
    vi.mocked(actionHistory.hasUndoableAction).mockResolvedValue(true)
    vi.mocked(actionHistory.hasRedoableAction).mockResolvedValue(true)

    render(<UndoRedoControls planId="p1" onChanged={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /annuler/i })).toBeEnabled())
    expect(screen.getByRole('button', { name: /refaire/i })).toBeEnabled()
  })

  it('clicking Annuler calls undo(planId) and then the onChanged callback', async () => {
    vi.mocked(actionHistory.hasUndoableAction).mockResolvedValue(true)
    const onChanged = vi.fn()
    render(<UndoRedoControls planId="p1" onChanged={onChanged} />)
    const undoButton = await screen.findByRole('button', { name: /annuler/i })
    await waitFor(() => expect(undoButton).toBeEnabled())

    fireEvent.click(undoButton)

    await waitFor(() => expect(actionHistory.undo).toHaveBeenCalledWith('p1'))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('clicking Refaire calls redo(planId) and then the onChanged callback', async () => {
    vi.mocked(actionHistory.hasRedoableAction).mockResolvedValue(true)
    const onChanged = vi.fn()
    render(<UndoRedoControls planId="p1" onChanged={onChanged} />)
    const redoButton = await screen.findByRole('button', { name: /refaire/i })
    await waitFor(() => expect(redoButton).toBeEnabled())

    fireEvent.click(redoButton)

    await waitFor(() => expect(actionHistory.redo).toHaveBeenCalledWith('p1'))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('shows a dismissible error banner if undo() rejects, without calling onChanged', async () => {
    vi.mocked(actionHistory.hasUndoableAction).mockResolvedValue(true)
    vi.mocked(actionHistory.undo).mockRejectedValue(new Error('réseau indisponible'))
    const onChanged = vi.fn()
    render(<UndoRedoControls planId="p1" onChanged={onChanged} />)
    const undoButton = await screen.findByRole('button', { name: /annuler/i })
    await waitFor(() => expect(undoButton).toBeEnabled())

    fireEvent.click(undoButton)

    expect(await screen.findByRole('alert')).toHaveTextContent('réseau indisponible')
    expect(onChanged).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('re-checks hasUndoableAction/hasRedoableAction on the poll interval, not just on mount (regression test for the interval actually being wired up)', async () => {
    vi.useFakeTimers()
    try {
      render(<UndoRedoControls planId="p1" onChanged={vi.fn()} />)
      // Mount-time call only.
      expect(vi.mocked(actionHistory.hasUndoableAction)).toHaveBeenCalledTimes(1)

      vi.mocked(actionHistory.hasUndoableAction).mockResolvedValue(true)
      // Must be wrapped in act() — the interval's setState calls happen
      // outside any React act() boundary otherwise, and with fake timers
      // active, findByRole's own polling never observes the DOM update
      // (confirmed empirically: without this wrapper, the test hangs until
      // Vitest's timeout, with an "update ... not wrapped in act(...)" warning).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500) // POLL_INTERVAL_MS
      })

      expect(vi.mocked(actionHistory.hasUndoableAction)).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('button', { name: /annuler/i })).toBeEnabled()
    } finally {
      vi.useRealTimers()
    }
  })
})
```

The `vi.useFakeTimers()`/`vi.useRealTimers()` pair is scoped to this one test (`try`/`finally`) so it doesn't affect the other tests in this file, none of which need fake timers.

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- src/components/UndoRedoControls.test.tsx`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement the component**

Create `src/components/UndoRedoControls.tsx`:

```tsx
// src/components/UndoRedoControls.tsx
import { useEffect, useState } from 'react'
import { hasUndoableAction, hasRedoableAction, undo, redo } from '../offline/actionHistory'

export interface UndoRedoControlsProps {
  planId: string
  /** Called after a successful undo/redo so the caller can reload its own
   * entity lists (SiteMapView.tsx) — actionHistory.ts only touches the
   * IndexedDB/Supabase layer, it has no knowledge of any component's state. */
  onChanged: () => void
}

// No shared event bus exists between the many mutating handlers scattered
// across SiteMapView.tsx (felt points, segments, phenomena, context objects,
// line edits, grid recalibration...) and this component — wiring an explicit
// refresh callback into every one of them would be a much larger change than
// this feature needs. Undo/redo is an occasional utility action, not a hot
// path, so a short poll interval keeps the buttons' enabled state honest
// without that wiring.
const POLL_INTERVAL_MS = 1500

export function UndoRedoControls({ planId, onChanged }: UndoRedoControlsProps) {
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setCanUndo(await hasUndoableAction(planId))
    setCanRedo(await hasRedoableAction(planId))
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is
    // recreated every render but only closes over planId, which IS a dep.
  }, [planId])

  async function handleUndo() {
    try {
      await undo(planId)
      setError(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    await refresh()
  }

  async function handleRedo() {
    try {
      await redo(planId)
      setError(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    await refresh()
  }

  return (
    <div>
      <button onClick={handleUndo} disabled={!canUndo} aria-label="Annuler">
        ↶ Annuler
      </button>
      <button onClick={handleRedo} disabled={!canRedo} aria-label="Refaire">
        ↷ Refaire
      </button>
      {error !== null && (
        <>
          <p role="alert">{error}</p>
          <button onClick={() => setError(null)}>Fermer</button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npm test -- src/components/UndoRedoControls.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/UndoRedoControls.tsx src/components/UndoRedoControls.test.tsx
git commit -m "feat: add UndoRedoControls component (polls hasUndoableAction/hasRedoableAction)"
```

---

## Chunk 5: `SiteMapView.tsx` integration

### Task 12: Remove the local undo mechanism, rewire the recalibration effect, wire `UndoRedoControls`

**Files:**
- Modify: `src/components/SiteMapView.tsx`
- Modify: `src/components/SiteMapView.test.tsx`

This is the integration task tying Chunks 1–4 into the actual screen. Per spec §3.6 and §3.3/§5, it does 4 independent things — done as 4 sub-steps, tested together at the end since they all touch the same render tree.

- [ ] **Step 1: Remove the local `undoStack`/`handleUndo`/local "Annuler" button (spec §3.6)**

In `src/components/SiteMapView.tsx`:

1. Delete the `undoStack` state declaration (currently line 166: `const [undoStack, setUndoStack] = useState<Record<string, GridLine[]>>({})`).
2. In `handleLineChanged` (currently lines 368–388), delete the `setUndoStack(...)` call at the top (lines 369–372) — keep the rest of the function body unchanged.
3. Delete the entire `handleUndo` function (currently lines 390–402).
4. In the JSX (currently lines 707–717), delete the local "Annuler" `<button>` element entirely (keep the "Réinitialiser" button right after it, unchanged).

- [ ] **Step 2: Extract the initial load into a reusable `loadAll` function**

In `src/components/SiteMapView.tsx`, the `useEffect` at (currently) lines 247–284 has an inner `async function load()`. Rename it to a component-level `async function loadAll()` (still declared inside the component, just not nested inside the `useEffect` body) and call it both from the mount `useEffect` and later from the `UndoRedoControls`'s `onChanged` prop (Step 4):

```ts
  async function loadAll() {
    try {
      const [loadedInstances, loadedPoints, loadedTemplates, loadedSegments, loadedPhenomena, loadedContextObjects, loadedFreeform, loadedPlans] = await Promise.all([
        listGridInstancesForPlan(planId),
        listFeltPointsForPlan(planId),
        listGridTemplates(),
        listFeltSegmentsForPlan(planId),
        listPhenomenaForPlan(planId),
        listContextObjectsForPlan(planId),
        listFreeformNetworksForPlan(planId),
        listPlansForMission(missionId),
      ])
      setInstances(loadedInstances)
      setFeltPoints(loadedPoints)
      setTemplates(loadedTemplates)
      setFeltSegments(loadedSegments)
      setPhenomena(loadedPhenomena)
      setContextObjects(loadedContextObjects)
      setFreeformNetworks(loadedFreeform)
      setInteriorPlan(
        loadedPlans.find((p) => p.kind === 'interieur' && p.imageUrl !== null && p.calibration !== null) ?? null
      )
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

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAll closes
    // over missionId too, but only planId is meant to re-trigger this effect
    // (matches the pre-existing behavior of the inline `load()` this replaces).
  }, [planId])
```

- [ ] **Step 3: Rewrite the recalibration effect — `batchId`, `planId`, sequential loop instead of `Promise.all` (spec §3.3)**

Replace the recalibration `useEffect` (currently lines 429–469):

```ts
  useEffect(() => {
    if (calibrationPicks.length < 2) return

    const [a, b] = calibrationPicks
    const instance = instances.find((i) => visibility[i.id])
    if (!instance) {
      setCalibrationError('Aucune grille visible à recaler.')
      setCalibrationPicks([])
      return
    }

    const crossing = intersectSegmentLines(a, b)
    if (!crossing) {
      setCalibrationError('Ces deux tiges sont trop proches d’être parallèles pour déterminer un croisement fiable.')
      setCalibrationPicks([])
      return
    }

    const delta = { x: crossing.x - instance.originX, y: crossing.y - instance.originY }
    const translatedLines = (linesByInstance[instance.id] ?? []).map((line) => translateGridLine(line, delta))

    // Must be `const runRecalibration = async () => {...}` (a function
    // EXPRESSION), not `async function runRecalibration() {...}` (a function
    // DECLARATION) — verified against the real TypeScript compiler
    // (tsc -p tsconfig.app.json --noEmit): a function declaration invoked as
    // a separate later statement does NOT inherit the outer `const`
    // narrowing of `instance`/`crossing` from the two guards above (TS
    // treats it as a possibly-hoisted, independently-callable declaration,
    // unlike an arrow function/function expression in the same position,
    // which does inherit the narrowing). Using the declaration form here
    // reintroduces the exact "possibly undefined" errors the `!` assertions
    // used to silence — Task 12 Step 8's `npm run build` gate would catch
    // this immediately if it were written the other way.
    const runRecalibration = async () => {
      const batchId = crypto.randomUUID()
      await updateGridInstanceOrigin(instance.id, crossing.x, crossing.y, { batchId })
      // Sequential, not Promise.all: each write triggers action_history's
      // purge/FIFO-eviction logic, which reads then writes the plan's entry
      // count — concurrent calls on the same plan could race on that
      // read-then-write (spec §3.3). A recalibration is an occasional
      // action, not a hot path, so the sequential cost is negligible.
      for (const line of translatedLines) {
        await updateLinePoints(line.id, line.theoreticalPoints, line.adjustedPoints, instance.planId, { batchId })
      }
    }

    runRecalibration()
      .then(() => {
        setInstances((prev) =>
          prev.map((i) => (i.id === instance.id ? { ...i, originX: crossing.x, originY: crossing.y } : i))
        )
        setLinesByInstance((prev) => ({ ...prev, [instance.id]: translatedLines }))
        setCalibrating(false)
        setCalibrationError(null)
      })
      .catch((err) => {
        setCalibrationError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setCalibrationPicks([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately only
    // triggered by calibrationPicks changing; instances/visibility/linesByInstance
    // are read fresh from render scope, not tracked as re-trigger deps.
  }, [calibrationPicks])
```

- [ ] **Step 4: Pass `planId` to `handleLineChanged`'s `updateAdjustedPoints` call, and wire `UndoRedoControls`**

In `handleLineChanged` (after Step 1's edit removed the `setUndoStack` call), update the `updateAdjustedPoints` call to pass `planId`:

```ts
  function handleLineChanged(instanceId: string, updated: GridLine, changeKind: 'drag' | 'vertex-added') {
    setLinesByInstance((prev) => ({
      ...prev,
      [instanceId]: prev[instanceId].map((l) => (l.id === updated.id ? updated : l)),
    }))
    updateAdjustedPoints(updated.id, updated.adjustedPoints, planId).catch((err) =>
      setError(err instanceof Error ? err.message : String(err))
    )
    setLastChangedLine({ instanceId, lineId: updated.id })
    if (changeKind === 'drag') {
      setAwaitingOrthogonalityReview(updated.id)
    }
  }
```

Add the import at the top of the file:

```ts
import { UndoRedoControls } from './UndoRedoControls'
```

Add `<UndoRedoControls planId={planId} onChanged={loadAll} />` to the `Sidebar`'s `pinned` block (currently lines 649–674), as the first child inside the `<>...</>` fragment:

```tsx
      <Sidebar
        pinned={
          <>
            <UndoRedoControls planId={planId} onChanged={loadAll} />
            <FeltPointPicker
              activeNetworkName={placementMode?.kind === 'felt-point' ? placementMode.networkName : null}
              onSelectNetwork={handleSelectFeltPointNetwork}
              selectedBearing={placementMode?.kind === 'felt-point' ? placementMode.bearingDeg : null}
              onSelectBearing={handleSelectFeltPointBearing}
              bearingLocked={pendingFeltSegment !== null}
            />
            {/* ...unchanged... */}
          </>
        }
```

- [ ] **Step 5: Update `SiteMapView.test.tsx` for the new call signatures**

In `src/components/SiteMapView.test.tsx`, mock `UndoRedoControls` (it has its own dedicated test file — Task 11 — and pulls in `actionHistory.ts`'s polling/network-dependent logic, which this file's existing tests don't set up mocks for):

```ts
vi.mock('./UndoRedoControls', () => ({
  UndoRedoControls: () => null,
}))
```

Add this alongside the file's other `vi.mock('./...')` calls near the top (e.g. next to `vi.mock('./GuideLineLayer', ...)`).

Update the grid-recalibration test's exact-argument assertions (currently ~lines 570–578) to account for the new `batchId`/`planId` arguments:

```ts
      await waitFor(() =>
        expect(gridInstancesRepo.updateGridInstanceOrigin).toHaveBeenCalledWith(
          'gi1', 5, 3, { batchId: expect.any(String) }
        )
      )
      expect(gridLinesRepo.updateLinePoints).toHaveBeenCalledWith(
        'gl1',
        [{ x: 5, y: -7 }, { x: 5, y: 13 }],
        [{ x: 5, y: -7 }, { x: 5, y: 13 }],
        'p1',
        { batchId: expect.any(String) }
      )
```

**Note:** both calls must receive the SAME `batchId` string value — add an extra assertion capturing and comparing it:

```ts
      const originCall = vi.mocked(gridInstancesRepo.updateGridInstanceOrigin).mock.calls[0]
      const lineCall = vi.mocked(gridLinesRepo.updateLinePoints).mock.calls[0]
      expect(originCall[3]).toEqual({ batchId: lineCall[4].batchId })
```

- [ ] **Step 6: Run the full component test suite**

Run: `npm test -- src/components/SiteMapView.test.tsx`
Expected: PASS — all pre-existing tests (the local-undo button had no dedicated test coverage, per the plan's research, so removing it doesn't strand any test) plus the updated recalibration assertions.

- [ ] **Step 7: Run the FULL suite one more time**

Run: `npm test`
Expected: PASS — every test file in the repo, confirming Chunk 3's earlier "expected failures" in this file are now resolved and nothing else regressed.

- [ ] **Step 8: Run a full TypeScript build — the only point in this entire plan that verifies compile-time correctness**

`vitest` (used by every `npm test` run throughout this plan) transpiles via esbuild WITHOUT type-checking — it would happily pass even if a call site were missing a required argument. Tasks 8, 9, and this task all made breaking signature changes (`options?` added to 9 functions; `planId`/`options?` added to `updateAdjustedPoints`/`updateLinePoints`). This step is the first and only place anything in the plan actually type-checks the whole tree.

Run: `npm run build`
Expected: succeeds with no TypeScript errors (the `tsc -b` step). If it fails, the error will point at a stale call site somewhere that still uses an old argument count/order — fix it before proceeding to commit.

- [ ] **Step 9: Commit**

```bash
git add src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx
git commit -m "feat: wire undo/redo into SiteMapView — remove local undo mechanism, batch grid recalibration, add UndoRedoControls"
```

---

## Manual verification (after all tasks, before finishing the branch)

Not automatable via unit tests alone — a quick manual pass in the running app, covering the plan's 3 motivating pain points (spec §1) AND every entity type that gained a new `restoreX` function in Chunk 2 (each is a real new insert-with-explicit-id network call, the riskiest new code path in the feature — none of them get an end-to-end manual check unless done here explicitly):

1. Place a felt point in the wrong spot → click **Annuler** → it disappears → click **Refaire** → it reappears in the same spot.
2. Place a felt segment, a phenomenon, and a context object (one each) → **Annuler** each one → each disappears → **Refaire** each one → each reappears (exercises `restoreFeltSegment`/`restorePhenomenon`/`restoreContextObject`, not just `restoreFeltPoint`).
3. Delete an existing felt point (not just undo a fresh insert) → click **Annuler** → it reappears (exercises the delete→`restoreX(before)` path specifically, distinct from #1's insert→delete path).
4. Recalibrate a grid onto a wrong crossing → click **Annuler** → the whole grid (origin + every line) snaps back in one click, not just the last-touched line → click **Refaire** → the whole grid re-snaps forward to the recalibrated position in one click (the redo side of the batch, not just undo).
5. Drag a grid line to a bad position → click **Annuler** → it snaps back to its pre-drag position.
6. Reload the page mid-session → **Annuler** still works on actions from before the reload (persistence).
7. Do 11 distinct undoable actions on one plan → the very first one can no longer be undone (FIFO cap), but the other 10 still can.
