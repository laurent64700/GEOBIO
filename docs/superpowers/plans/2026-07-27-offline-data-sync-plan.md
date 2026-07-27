# Mode hors-ligne terrain — cache et synchronisation des données — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if
> subagents available) or superpowers:executing-plans to implement this plan. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire fonctionner le relevé terrain de GEOBIO (grilles, points/segments
ressentis, phénomènes, objets de contexte, tracés eau/faille) sans réseau, avec
synchronisation automatique vers Supabase au retour de la connectivité, en réutilisant
un mécanisme de reprise de mission déjà existant pour que l'app soit réellement
atteignable hors-ligne (pas seulement les données, aussi le point d'entrée).

**Architecture:** Enveloppe "cache-through" : chaque fonction repo tente Supabase
d'abord, bascule sur IndexedDB en cas d'échec réseau (lecture depuis le cache, écriture
mise en file `pending_mutations`). IDs générés côté client (`crypto.randomUUID()`) pour
qu'un enregistrement créé hors-ligne ait déjà son ID final. Point d'entrée hors-ligne
via un object store `current_session` réutilisant le mécanisme `ResumePhase` /
`initialResumePhase` déjà présent dans le code (`App.tsx` / `MissionWorkspace.tsx`).

**Tech Stack:** React 19, TypeScript, Vite, `idb` (nouvelle dépendance — wrapper minimal
d'IndexedDB), Supabase, Vitest + Testing Library.

**Spec de référence :** `docs/superpowers/specs/2026-07-27-offline-data-sync-design.md`
(approuvé après 5 passes de relecture — s'y référer pour tout le contexte/raisonnement
que ce plan ne répète pas).

---

## Chunk 1: Infrastructure (fondations, aucun comportement visible)

### Task 1.1: Ajouter la dépendance `idb`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Installer `idb`**

Run: `npm install idb`
Expected: `idb` ajouté dans `dependencies` de `package.json`, `package-lock.json` mis à
jour. Pas de dépendances transitives significatives (c'est un wrapper à un seul fichier).

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add idb dependency for offline IndexedDB cache"
```

### Task 1.2: Schéma et ouverture de la base locale

**Files:**
- Create: `src/offline/db.ts`
- Test: `src/offline/db.test.ts`

Object stores (voir spec §4.2) : `grid_template` (pas de `plan_id`, clé = `id`),
`grid_instance`, `grid_line` (indexé `grid_instance_id`, pas `plan_id` — les lignes sont
groupées par instance, pas directement par plan), `felt_point`, `felt_segment`,
`phenomenon`, `context_object`, `freeform_network`, `plan` (indexé `mission_id`) —
tous avec un index `plan_id` (ou `grid_instance_id`/`mission_id` selon le cas) en plus de
la clé primaire `id`. Plus deux stores structurellement différents : `current_session`
(une seule entrée fixe, clé `'current'`) et `pending_mutations` (clé auto-incrémentée).

- [ ] **Step 1: Write the failing test**

```typescript
// src/offline/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDB, STORE_NAMES } from './db'

describe('getDB', () => {
  it('opens the database with every expected object store', async () => {
    const db = await getDB()
    for (const store of STORE_NAMES) {
      expect(db.objectStoreNames.contains(store)).toBe(true)
    }
  })

  it('creates a plan_id index on grid_template siblings but not on grid_template itself', async () => {
    const db = await getDB()
    const tx = db.transaction('felt_point', 'readonly')
    expect(tx.store.indexNames.contains('plan_id')).toBe(true)
    const templateTx = db.transaction('grid_template', 'readonly')
    expect(templateTx.store.indexNames.contains('plan_id')).toBe(false)
  })

  it('indexes grid_line by grid_instance_id, not plan_id', async () => {
    const db = await getDB()
    const tx = db.transaction('grid_line', 'readonly')
    expect(tx.store.indexNames.contains('grid_instance_id')).toBe(true)
  })
})
```

Note : ce test a besoin de `fake-indexeddb` (IndexedDB n'existe pas nativement dans
l'environnement de test jsdom). L'installer d'abord :

Run: `npm install --save-dev fake-indexeddb`

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/offline/db.test.ts`
Expected: FAIL — `Cannot find module './db'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/offline/db.ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

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
] as const

export type StoreName = (typeof STORE_NAMES)[number]

// Object stores indexed by plan_id (most terrain-phase data — see spec §4.2).
const PLAN_ID_STORES: StoreName[] = [
  'felt_point',
  'felt_segment',
  'phenomenon',
  'context_object',
  'freeform_network',
  'grid_instance',
]

interface GeobioOfflineDB extends DBSchema {
  [key: string]: { key: string | number; value: unknown }
}

const DB_NAME = 'geobio-offline'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<GeobioOfflineDB>> | null = null

export function getDB(): Promise<IDBPDatabase<GeobioOfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GeobioOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
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
      },
    })
  }
  return dbPromise
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/offline/db.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add src/offline/db.ts src/offline/db.test.ts package.json package-lock.json
git commit -m "feat(offline): add IndexedDB schema and db handle"
```

### Task 1.3: Générateur d'ID côté client

**Files:**
- Create: `src/offline/clientId.ts`
- Test: `src/offline/clientId.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/offline/clientId.test.ts
import { describe, it, expect } from 'vitest'
import { generateClientId } from './clientId'

describe('generateClientId', () => {
  it('returns a valid UUID', () => {
    const id = generateClientId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it('returns a different id on each call', () => {
    expect(generateClientId()).not.toBe(generateClientId())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/offline/clientId.test.ts`
Expected: FAIL — `Cannot find module './clientId'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/offline/clientId.ts
// crypto.randomUUID() is available in every secure context this app runs in
// (HTTPS/localhost — same requirement the PWA itself already has). Generating
// the id client-side (instead of relying on Postgres's `default
// gen_random_uuid()`) means an offline-created record already has its final,
// real id from the moment of creation — no id-remapping needed once synced
// (spec §4.1).
export function generateClientId(): string {
  return crypto.randomUUID()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/offline/clientId.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add src/offline/clientId.ts src/offline/clientId.test.ts
git commit -m "feat(offline): add client-side UUID generator for offline-created records"
```

### Task 1.4: Détection de connectivité

**Files:**
- Create: `src/offline/connectivity.ts`
- Test: `src/offline/connectivity.test.ts`

Test réseau léger + proactif (spec §4.3) : `navigator.onLine` seul peut mentir, donc on
le combine à un vrai `fetch` HEAD vers l'URL Supabase configurée, avec un timeout court.

- [ ] **Step 1: Write the failing test**

```typescript
// src/offline/connectivity.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isOnlineNow } from './connectivity'

describe('isOnlineNow', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('returns true when navigator.onLine is true and the network probe succeeds', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)

    expect(await isOnlineNow()).toBe(true)
  })

  it('returns false when navigator.onLine is false, without even probing the network', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    expect(await isOnlineNow()).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns false when navigator.onLine is true but the network probe fails (lying online state)', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    expect(await isOnlineNow()).toBe(false)
  })

  it('returns false when the network probe times out', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(fetch).mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('aborted')), 50))
    )

    expect(await isOnlineNow()).toBe(false)
  }, 2000)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/offline/connectivity.test.ts`
Expected: FAIL — `Cannot find module './connectivity'`

- [ ] **Step 3: Write minimal implementation**

Check the exact Supabase URL env var name first:

Run: `grep -n "VITE_SUPABASE_URL" "D:/LAURENT PC/GEOBIO/src/lib/supabaseClient.ts"`

```typescript
// src/offline/connectivity.ts
const PROBE_TIMEOUT_MS = 3000

// navigator.onLine alone can lie (true even with no real internet access —
// e.g. connected to a local router with no WAN uplink), so it's combined
// with a real lightweight network probe before declaring "online" for real
// (spec §4.3). Checking navigator.onLine FIRST avoids firing a network
// request at all in the common, correctly-detected offline case.
export async function isOnlineNow(): Promise<boolean> {
  if (!navigator.onLine) return false

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal })
    return response.ok || response.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/offline/connectivity.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/offline/connectivity.ts src/offline/connectivity.test.ts
git commit -m "feat(offline): add proactive connectivity detection"
```

### Task 1.5: File d'attente des mutations en attente

**Files:**
- Create: `src/offline/pendingMutations.ts`
- Test: `src/offline/pendingMutations.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/offline/pendingMutations.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { enqueueMutation, listPendingMutations, removePendingMutation, incrementAttempts } from './pendingMutations'
import { getDB } from './db'

describe('pendingMutations', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('pending_mutations')
  })

  it('enqueues a mutation and lists it back with attempts starting at 0', async () => {
    await enqueueMutation({ table: 'felt_point', operation: 'insert', payload: { id: 'fp1' } })

    const pending = await listPendingMutations()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ table: 'felt_point', operation: 'insert', attempts: 0 })
    expect(pending[0].payload).toEqual({ id: 'fp1' })
  })

  it('lists mutations in FIFO order (insertion order)', async () => {
    await enqueueMutation({ table: 'felt_point', operation: 'insert', payload: { id: 'fp1' } })
    await enqueueMutation({ table: 'felt_point', operation: 'insert', payload: { id: 'fp2' } })

    const pending = await listPendingMutations()
    expect(pending.map((p) => p.payload)).toEqual([{ id: 'fp1' }, { id: 'fp2' }])
  })

  it('removes a mutation by its queue id', async () => {
    await enqueueMutation({ table: 'felt_point', operation: 'insert', payload: { id: 'fp1' } })
    const [first] = await listPendingMutations()

    await removePendingMutation(first.id)

    expect(await listPendingMutations()).toHaveLength(0)
  })

  it('increments the attempts counter without removing the entry', async () => {
    await enqueueMutation({ table: 'felt_point', operation: 'insert', payload: { id: 'fp1' } })
    const [first] = await listPendingMutations()

    await incrementAttempts(first.id)

    const [after] = await listPendingMutations()
    expect(after.attempts).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/offline/pendingMutations.test.ts`
Expected: FAIL — `Cannot find module './pendingMutations'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/offline/pendingMutations.ts
import { getDB } from './db'

export type MutationOperation = 'insert' | 'update' | 'delete'

export interface PendingMutation {
  id: number
  table: string
  operation: MutationOperation
  payload: unknown
  createdAt: string
  attempts: number
}

export type EnqueueMutationInput = Pick<PendingMutation, 'table' | 'operation' | 'payload'>

export async function enqueueMutation(input: EnqueueMutationInput): Promise<void> {
  const db = await getDB()
  await db.add('pending_mutations', {
    ...input,
    createdAt: new Date().toISOString(),
    attempts: 0,
  } as unknown as PendingMutation)
}

// getAll() returns entries in primary-key order for an auto-incrementing key,
// which is insertion order here — exactly the FIFO replay order sync needs.
export async function listPendingMutations(): Promise<PendingMutation[]> {
  const db = await getDB()
  return (await db.getAll('pending_mutations')) as PendingMutation[]
}

export async function removePendingMutation(id: number): Promise<void> {
  const db = await getDB()
  await db.delete('pending_mutations', id)
}

export async function incrementAttempts(id: number): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('pending_mutations', 'readwrite')
  const entry = (await tx.store.get(id)) as PendingMutation | undefined
  if (entry) {
    entry.attempts += 1
    await tx.store.put(entry)
  }
  await tx.done
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/offline/pendingMutations.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/offline/pendingMutations.ts src/offline/pendingMutations.test.ts
git commit -m "feat(offline): add pending-mutations queue"
```

### Task 1.6: Type d'erreur dédié pour distinguer "Supabase a répondu avec une vraie
erreur métier" d'un "échec réseau"

**Files:**
- Create: `src/offline/supabaseQueryError.ts`
- Test: `src/offline/supabaseQueryError.test.ts`

**Pourquoi ce fichier existe :** le helper `cachedList`/`cachedWrite` (Chunk 2, Task 2.1)
doit basculer sur le cache/la file d'attente uniquement en cas d'échec **réseau** — pas
quand Supabase répond correctement mais rapporte une erreur métier (contrainte
violée, RLS, etc., §4.5 de la spec dit explicitement "en cas d'échec réseau"). Sans
distinction, une vraie erreur métier serait avalée silencieusement et traitée comme un
passage hors-ligne : l'écriture semblerait "réussir" dans l'UI (appliquée de façon
optimiste au cache local) alors qu'elle a réellement échoué côté serveur, et resterait
en échec silencieux à chaque tentative de synchro future. Chaque repo lève cette classe
d'erreur (au lieu d'une `Error` nue) quand `{ error }` de Supabase est non-null ; le
helper générique re-lève telle quelle toute `SupabaseQueryError` au lieu de la traiter
comme un échec réseau, et ne bascule sur le cache/la file que pour tout AUTRE type
d'exception (une vraie panne `fetch`, qui lève un `TypeError`/`AbortError`, jamais une
`SupabaseQueryError`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/offline/supabaseQueryError.test.ts
import { describe, it, expect } from 'vitest'
import { SupabaseQueryError } from './supabaseQueryError'

describe('SupabaseQueryError', () => {
  it('is a real Error subclass, distinguishable via instanceof', () => {
    const err = new SupabaseQueryError('Impossible de charger les gabarits de grille : boom')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(SupabaseQueryError)
    expect(err.message).toBe('Impossible de charger les gabarits de grille : boom')
  })

  it('is NOT what a plain network failure (TypeError) is', () => {
    const networkFailure = new TypeError('Failed to fetch')
    expect(networkFailure).not.toBeInstanceOf(SupabaseQueryError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/offline/supabaseQueryError.test.ts`
Expected: FAIL — `Cannot find module './supabaseQueryError'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/offline/supabaseQueryError.ts
// Thrown by every repo when Supabase itself responds with `{ error }` (a
// real business/query error — constraint violation, RLS, malformed query,
// etc.) — as opposed to a genuine network failure (fetch throwing a
// TypeError/AbortError). cacheThrough.ts re-throws this type instead of
// treating it as "offline, fall back to cache/queue" (see its own doc
// comment for why the distinction matters).
export class SupabaseQueryError extends Error {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/offline/supabaseQueryError.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add src/offline/supabaseQueryError.ts src/offline/supabaseQueryError.test.ts
git commit -m "feat(offline): add SupabaseQueryError to distinguish business errors from network failures"
```

**End of Chunk 1 — dispatch plan-document-reviewer before continuing to Chunk 2.**

---

## Chunk 2: Le patron cache-through, et son premier repo (`gridTemplatesRepo`)

### Task 2.1: Le helper générique cache-through

**Files:**
- Create: `src/offline/cacheThrough.ts`
- Test: `src/offline/cacheThrough.test.ts`

Ce helper est le cœur de tout le reste du plan (chunks 3-6 ne font que l'appeler avec
des paramètres différents). Deux fonctions : `cachedList` (tente Supabase, retombe sur
le cache local, rafraîchit le cache en cas de succès) et `cachedWrite` (tente Supabase,
retombe sur mise en file + mise à jour optimiste du cache local).

- [ ] **Step 1: Write the failing test**

```typescript
// src/offline/cacheThrough.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { cachedList, cachedWrite } from './cacheThrough'
import { getDB } from './db'
import { listPendingMutations } from './pendingMutations'
import { SupabaseQueryError } from './supabaseQueryError'
import * as connectivity from './connectivity'

vi.mock('./connectivity')

interface Widget { id: string; planId: string; label: string }

describe('cachedList', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('felt_point')
  })

  it('fetches from Supabase when online, and refreshes the local cache with the result', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const widgets: Widget[] = [{ id: 'w1', planId: 'p1', label: 'a' }]
    const fetcher = vi.fn().mockResolvedValue(widgets)

    const result = await cachedList('felt_point', 'p1', fetcher)

    expect(result).toEqual(widgets)
    const db = await getDB()
    expect(await db.getAll('felt_point')).toEqual(widgets)
  })

  it('falls back to the local cache when the online fetch throws', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const db = await getDB()
    await db.put('felt_point', { id: 'w1', planId: 'p1', label: 'cached' })
    const fetcher = vi.fn().mockRejectedValue(new Error('network down'))

    const result = await cachedList<Widget>('felt_point', 'p1', fetcher)

    expect(result).toEqual([{ id: 'w1', planId: 'p1', label: 'cached' }])
  })

  it('reads straight from the local cache when already known to be offline, without calling the fetcher', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const db = await getDB()
    await db.put('felt_point', { id: 'w1', planId: 'p1', label: 'cached' })
    const fetcher = vi.fn()

    const result = await cachedList<Widget>('felt_point', 'p1', fetcher)

    expect(result).toEqual([{ id: 'w1', planId: 'p1', label: 'cached' }])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('scopes cached reads to the given plan_id, not returning other plans\' cached data', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const db = await getDB()
    await db.put('felt_point', { id: 'w1', planId: 'p1', label: 'mine' })
    await db.put('felt_point', { id: 'w2', planId: 'p2', label: 'other plan' })

    const result = await cachedList<Widget>('felt_point', 'p1', vi.fn())

    expect(result).toEqual([{ id: 'w1', planId: 'p1', label: 'mine' }])
  })

  it('propagates a SupabaseQueryError (a real business error) instead of falling back to the cache', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const db = await getDB()
    await db.put('felt_point', { id: 'w1', planId: 'p1', label: 'cached' })
    const fetcher = vi.fn().mockRejectedValue(new SupabaseQueryError('Impossible de charger : RLS violation'))

    await expect(cachedList<Widget>('felt_point', 'p1', fetcher)).rejects.toThrow(SupabaseQueryError)
  })
})

describe('cachedWrite', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('felt_point')
    await db.clear('pending_mutations')
  })

  // toRow mirrors what every repo already does inline for its own Supabase
  // calls — snake_case column names. Deliberately different key names from
  // the domain object (label -> display_label) so a test bug that
  // accidentally enqueues the domain form instead of the row form is
  // impossible to miss.
  const toRow = (w: Widget) => ({ id: w.id, plan_id: w.planId, display_label: w.label })

  it('writes through to Supabase when online, and mirrors the result into the local cache', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const created: Widget = { id: 'w1', planId: 'p1', label: 'new' }
    const writer = vi.fn().mockResolvedValue(created)

    const result = await cachedWrite('felt_point', 'felt_point', 'insert', created, toRow, writer)

    expect(result).toEqual(created)
    const db = await getDB()
    expect(await db.get('felt_point', 'w1')).toEqual(created)
    expect(await listPendingMutations()).toHaveLength(0)
  })

  it('queues the mutation (in ROW form, not domain form) and applies it optimistically to the local cache when the online write fails', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const created: Widget = { id: 'w1', planId: 'p1', label: 'new' }
    const writer = vi.fn().mockRejectedValue(new Error('network down'))

    const result = await cachedWrite('felt_point', 'felt_point', 'insert', created, toRow, writer)

    expect(result).toEqual(created)
    const db = await getDB()
    expect(await db.get('felt_point', 'w1')).toEqual(created)
    const pending = await listPendingMutations()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      table: 'felt_point',
      operation: 'insert',
      payload: { id: 'w1', plan_id: 'p1', display_label: 'new' },
    })
  })

  it('queues directly without attempting Supabase when already known to be offline', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const created: Widget = { id: 'w1', planId: 'p1', label: 'new' }
    const writer = vi.fn()

    await cachedWrite('felt_point', 'felt_point', 'insert', created, toRow, writer)

    expect(writer).not.toHaveBeenCalled()
    expect(await listPendingMutations()).toHaveLength(1)
  })

  it('propagates a SupabaseQueryError (a real business error) instead of queueing it as an offline write', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const created: Widget = { id: 'w1', planId: 'p1', label: 'new' }
    const writer = vi.fn().mockRejectedValue(new SupabaseQueryError('contrainte violée'))

    await expect(cachedWrite('felt_point', 'felt_point', 'insert', created, toRow, writer)).rejects.toThrow(SupabaseQueryError)
    const db = await getDB()
    expect(await db.get('felt_point', 'w1')).toBeUndefined()
    expect(await listPendingMutations()).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/offline/cacheThrough.test.ts`
Expected: FAIL — `Cannot find module './cacheThrough'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/offline/cacheThrough.ts
import { getDB, type StoreName } from './db'
import { isOnlineNow } from './connectivity'
import { enqueueMutation, type MutationOperation } from './pendingMutations'
import { SupabaseQueryError } from './supabaseQueryError'

// Every cached row must carry planId — every store this is used for is
// indexed by it (db.ts's PLAN_ID_STORES). grid_template (no plan_id) and
// grid_line (indexed by gridInstanceId instead) are NOT wrapped by this
// generic helper — see Task 5.x / 3.x for their own narrow variants.
interface PlanScoped {
  id: string
  planId: string
}

async function replaceCachedItems<T extends PlanScoped>(
  store: StoreName,
  planId: string,
  items: T[]
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(store, 'readwrite')
  const index = tx.store.index('plan_id')
  let cursor = await index.openCursor(IDBKeyRange.only(planId))
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  for (const item of items) {
    await tx.store.put(item)
  }
  await tx.done
}

async function readCachedItems<T extends PlanScoped>(store: StoreName, planId: string): Promise<T[]> {
  const db = await getDB()
  return (await db.getAllFromIndex(store, 'plan_id', planId)) as T[]
}

/**
 * List cache-through: tries Supabase (via `fetcher`) when online, refreshing
 * the local cache with the result; falls back to the local cache on network
 * failure or when already known offline (spec §4.5). A `SupabaseQueryError`
 * (a real business error, not a network failure) is re-thrown as-is rather
 * than triggering the cache fallback — see supabaseQueryError.ts.
 */
export async function cachedList<T extends PlanScoped>(
  store: StoreName,
  planId: string,
  fetcher: () => Promise<T[]>
): Promise<T[]> {
  if (await isOnlineNow()) {
    try {
      const items = await fetcher()
      await replaceCachedItems(store, planId, items)
      return items
    } catch (err) {
      if (err instanceof SupabaseQueryError) throw err
      // fall through to cache on network failure
    }
  }
  return readCachedItems<T>(store, planId)
}

/**
 * Write cache-through (insert/update/delete): tries Supabase (via `writer`)
 * when online; on network failure (or when already known offline), applies
 * the change optimistically to the local cache and queues it in
 * `pending_mutations` for replay once connectivity returns (spec §4.5/§4.6).
 * `item` must already carry its final id (client-generated for inserts —
 * see clientId.ts).
 *
 * `toRow` converts the domain object (camelCase, what callers work with) to
 * the exact snake_case shape Supabase expects for this table — the same
 * conversion every repo already does inline for its own `insert`/`update`
 * calls. The QUEUED payload is the ROW form, not the domain form: sync.ts
 * (Chunk 8) replays queued mutations by calling `supabase.from(table)
 * .insert(payload)` directly, with no per-table mapping knowledge of its
 * own — it only ever sees rows, never domain objects. Each repo passes its
 * own existing row-shaping logic as `toRow` rather than duplicating it in
 * sync.ts. As with `cachedList`, a `SupabaseQueryError` is re-thrown as-is
 * instead of being queued as if it were an offline write.
 */
export async function cachedWrite<T extends PlanScoped>(
  store: StoreName,
  table: string,
  operation: MutationOperation,
  item: T,
  toRow: (item: T) => unknown,
  writer: () => Promise<T>
): Promise<T> {
  if (await isOnlineNow()) {
    try {
      const result = await writer()
      const db = await getDB()
      if (operation === 'delete') {
        await db.delete(store, result.id)
      } else {
        await db.put(store, result)
      }
      return result
    } catch (err) {
      if (err instanceof SupabaseQueryError) throw err
      // fall through to queue on network failure
    }
  }
  const db = await getDB()
  if (operation === 'delete') {
    await db.delete(store, item.id)
  } else {
    await db.put(store, item)
  }
  await enqueueMutation({ table, operation, payload: toRow(item) })
  return item
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/offline/cacheThrough.test.ts`
Expected: PASS (9/9)

- [ ] **Step 5: Commit**

```bash
git add src/offline/cacheThrough.ts src/offline/cacheThrough.test.ts
git commit -m "feat(offline): add generic cache-through list/write helpers"
```

### Task 2.2: Envelopper `gridTemplatesRepo` (référentiel global, pas de `plan_id`)

**Files:**
- Modify: `src/data/gridTemplatesRepo.ts`
- Modify: `src/data/gridTemplatesRepo.test.ts`

`grid_template` n'a pas de `plan_id` (référentiel global des 5 réseaux confirmés) —
`cachedList`/`cachedWrite` ne s'appliquent pas tels quels (ils supposent un
`plan_id`). Écrire une variante étroite directement dans ce fichier plutôt que de
complexifier le helper générique pour un seul cas particulier (YAGNI).

- [ ] **Step 1: Write the failing test**

Lire d'abord `src/data/gridTemplatesRepo.test.ts` existant pour connaître le style de
mock déjà en place (`createSupabaseChainMock`), puis ajouter :

```typescript
// Ajouter à src/data/gridTemplatesRepo.test.ts
import 'fake-indexeddb/auto'
import { getDB } from '../offline/db'
import * as connectivity from '../offline/connectivity'
vi.mock('../offline/connectivity')

// IMPORTANT : `vi.mock('../offline/connectivity')` auto-mock s'applique à TOUT
// le fichier, y compris aux tests déjà existants plus haut qui ne connaissent
// pas `isOnlineNow` et n'en configurent pas la valeur de retour. Un
// auto-mock non configuré résout `undefined` (falsy) par défaut : chaque
// test existant prendrait alors silencieusement la branche hors-ligne, lirait
// un cache IndexedDB vide, et recevrait `[]` au lieu des données mockées via
// `createSupabaseChainMock` — les faisant tous échouer. Ajouter ce
// `beforeEach` au niveau racine du fichier (avant tout `describe` existant,
// pas seulement dans le nouveau `describe` ci-dessous) pour que `isOnlineNow`
// résolve `true` par défaut partout, sauf là où un test le surcharge
// explicitement à `false` :
beforeEach(() => {
  vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
})

describe('listGridTemplates — offline fallback', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('grid_template')
  })

  it('falls back to the local cache when the online fetch fails, after having cached it once online', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const { from } = createSupabaseChainMock({
      data: [{ id: 't0', name: 'Hartmann', spacing_x_m: 1.8, spacing_y_m: 2.5, angle_true_north_deg: 0, origin_offset_x: 0, origin_offset_y: 0, color: '#d32f2f', vibratory_base: 7 }],
      error: null,
    })
    vi.mocked(supabase).from = from
    await listGridTemplates() // primes the cache while "online"

    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const templates = await listGridTemplates()

    expect(templates).toHaveLength(1)
    expect(templates[0].name).toBe('Hartmann')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/data/gridTemplatesRepo.test.ts`
Expected: FAIL — offline case returns `[]` or throws (no cache-through yet)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/data/gridTemplatesRepo.ts — modify listGridTemplates only, everything else unchanged
import { getDB } from '../offline/db'
import { isOnlineNow } from '../offline/connectivity'
import { SupabaseQueryError } from '../offline/supabaseQueryError'

export async function listGridTemplates(): Promise<GridTemplate[]> {
  if (await isOnlineNow()) {
    try {
      const { data, error } = await supabase.from('grid_template').select()
      if (error) throw new SupabaseQueryError(`Impossible de charger les gabarits de grille : ${error.message}`)
      const templates = (data as GridTemplateRow[]).map(mapRowToGridTemplate)
      const db = await getDB()
      const tx = db.transaction('grid_template', 'readwrite')
      await tx.store.clear()
      for (const t of templates) await tx.store.put(t)
      await tx.done
      return templates
    } catch (err) {
      if (err instanceof SupabaseQueryError) throw err
      // network failure (not a Supabase-reported error) — fall through to cache
    }
  }
  const db = await getDB()
  return db.getAll('grid_template') as Promise<GridTemplate[]>
}
```

Ce même changement (lever `SupabaseQueryError` au lieu d'une `Error` nue quand
`{ error }` est non-null, et ne re-lever que ce type précis dans le `catch`) doit être
répliqué dans les Chunks 3-5 partout où un repo teste explicitement `if (error) throw
...` avant de basculer en mode cache — remplace la logique de détection fragile par
`instanceof` initialement esquissée dans certaines de ces tâches.

Note : `createGridTemplate` n'est PAS enveloppé — créer un nouveau gabarit de réseau
n'est pas une action de relevé terrain (spec exclut `rodMarkersRepo`/référentiels de la
même façon ; les 5 réseaux confirmés existent déjà en base, ce chemin sert surtout à un
éventuel réseau personnalisé ajouté en préparation, en ligne).

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/data/gridTemplatesRepo.test.ts`
Expected: PASS (tous les tests existants + le nouveau)

- [ ] **Step 5: Commit**

```bash
git add src/data/gridTemplatesRepo.ts src/data/gridTemplatesRepo.test.ts
git commit -m "feat(offline): cache-through for gridTemplatesRepo.listGridTemplates"
```

**End of Chunk 2 — dispatch plan-document-reviewer before continuing.**

---

## Chunk 3: Cache-through pour les repos "plan_id simple" (patron répété)

Les 6 repos suivants partagent tous exactement la même forme : `listXForPlan(planId)`,
`createX(input)` (un seul enregistrement, `id` généré serveur aujourd'hui),
`deleteX(id)` — sauf `feltSegmentsRepo` qui n'a pas de `deleteX` exposé actuellement
(seulement `create`/`list`) et `freeformNetworksRepo` qui n'a que `create`/`list` (pas de
`delete` du tout, confirmé par la relecture de spec §2). Chaque tâche ci-dessous
applique le patron du Task 2.2 (mais avec `cachedList`/`cachedWrite` du Chunk 2, pas la
variante étroite de `gridTemplatesRepo`) à un repo précis.

**Patron à répéter pour chaque `listXForPlan`, en remplaçant `STORE`/`TABLE`/le
fetcher par les valeurs du tableau de la Task 3.1 :**

```typescript
import { cachedList } from '../offline/cacheThrough'
import { SupabaseQueryError } from '../offline/supabaseQueryError'

export async function listXForPlan(planId: string): Promise<X[]> {
  return cachedList('STORE', planId, async () => {
    const { data, error } = await supabase.from('TABLE').select().eq('plan_id', planId)
    if (error) throw new SupabaseQueryError(`Impossible de charger ... : ${error.message}`)
    return (data as XRow[]).map(mapRowToX)
  })
}
```

**Patron à répéter pour chaque `createX` :**

```typescript
import { cachedWrite } from '../offline/cacheThrough'
import { generateClientId } from '../offline/clientId'
import { SupabaseQueryError } from '../offline/supabaseQueryError'

export async function createX(input: CreateXInput): Promise<X> {
  const id = generateClientId()
  const row = { id, ...(/* colonnes mappées depuis input, snake_case */) }
  const item: X = { id, ...(/* mêmes champs, camelCase, correspondant à mapRowToX */) }
  return cachedWrite('STORE', 'TABLE', 'insert', item, () => row, async () => {
    const { data, error } = await supabase.from('TABLE').insert(row).select().single()
    if (error) throw new SupabaseQueryError(`Impossible d'enregistrer ... : ${error.message}`)
    return mapRowToX(data as XRow)
  })
}
```

**Pourquoi `SupabaseQueryError` et pas une `Error` nue ici :** `cachedList`/`cachedWrite`
(Chunk 2, Task 2.1) ne re-lèvent QUE les erreurs de type `SupabaseQueryError` — tout
le reste tombe dans le chemin "échec réseau, basculer sur le cache/la file". Si ce
fetcher/writer levait une `Error` nue pour une vraie erreur métier Supabase (contrainte
violée, RLS...), `cachedWrite` l'avalerait silencieusement et l'appliquerait de façon
optimiste au cache + file d'attente, comme si l'appareil était hors-ligne — l'écriture
semblerait réussir dans l'UI alors qu'elle a réellement échoué côté serveur. Chaque
`throw` déclenché par un `{ error }` Supabase non-null, dans ce chunk comme dans les
chunks 4 et 5, doit donc être un `SupabaseQueryError`, jamais une `Error` nue.

Le `toRow` passé ici est simplement `() => row` — la row a déjà été construite juste
au-dessus pour l'appel Supabase, pas besoin de la recalculer.

**Important — changement de comportement pour `createX` :** aujourd'hui, Postgres
génère l'`id` via son défaut (`gen_random_uuid()`). Après ce changement, l'`id` est
généré côté client et passé explicitement dans l'`insert` — **inconditionnellement,
en ligne comme hors-ligne** (`generateClientId()` est appelé avant toute branche
online/offline, pas seulement dans un chemin de repli — c'est ce qui garantit qu'un
enregistrement a son id final dès sa création, spec §4.1). Vérifié maintenant, pour
les 6 tables de ce chunk plus `grid_instance` (Task 3.7) : `grep -rn "generated always
as identity" supabase/migrations/*.sql` → **zéro résultat** dans tout le dossier ;
`felt_point`, `felt_segment`, `phenomenon`, `context_object`, `freeform_network` et
`grid_instance` utilisent tous `id uuid primary key default gen_random_uuid()` (jamais
`generated always as identity`) — confirmé directement dans
`supabase/migrations/0001_plan1_schema.sql` (freeform_network, grid_instance),
`0009_felt_point.sql`, `0015_felt_segment.sql`, `0016_phenomenon.sql`,
`0019_context_object.sql`. Aucune vérification supplémentaire requise à
l'implémentation — le changement est sûr pour les 9 tables couvertes par ce plan.

**Patron à répéter pour chaque `deleteX` (seulement pour les repos qui en ont un) :**

```typescript
export async function deleteX(id: string): Promise<void> {
  return cachedWrite('STORE', 'TABLE', 'delete', { id } as X, () => ({ id }), async () => {
    const { error } = await supabase.from('TABLE').delete().eq('id', id)
    if (error) throw new SupabaseQueryError(`Impossible de supprimer ... : ${error.message}`)
    return { id } as X
  })
}
```

### Task 3.1: Tableau de correspondance store/table par repo

Vérifié directement contre le code source réel de chaque repo (pas supposé) — les 3
colonnes de fonctions listent TOUTES les fonctions exportées de chaque fichier, pour
qu'aucune ne soit oubliée silencieusement (c'est précisément ce qui a été corrigé après
une relecture : `feltSegmentsRepo.deleteFeltSegment` existe bel et bien, et
`gridInstancesRepo.listGridInstancesForPlan` avait été omis d'un premier jet de ce
tableau).

| Repo | Store IndexedDB | Table Supabase | `listXForPlan` | `createX` | `deleteX` |
|---|---|---|---|---|---|
| `feltPointsRepo.ts` | `felt_point` | `felt_point` | oui | oui | oui |
| `feltSegmentsRepo.ts` | `felt_segment` | `felt_segment` | oui | oui | **oui** (`deleteFeltSegment` — non appelée par l'UI actuellement, seulement testée, mais reste enveloppée pour cohérence avec les 3 autres repos qui ont un delete) |
| `phenomenaRepo.ts` | `phenomenon` | `phenomenon` | oui | oui | oui |
| `contextObjectsRepo.ts` | `context_object` | `context_object` | oui | oui | oui |
| `freeformNetworksRepo.ts` | `freeform_network` | `freeform_network` | oui | oui | non |
| `gridInstancesRepo.ts` | `grid_instance` | `grid_instance` | **oui — voir Task 3.7** | oui — voir Task 3.7 | non — a `updateGridInstanceOrigin` à la place, voir Task 3.7 |

### Task 3.2: Envelopper `feltPointsRepo`

**Files:**
- Modify: `src/data/feltPointsRepo.ts`
- Modify: `src/data/feltPointsRepo.test.ts`

- [ ] **Step 1: Write the failing test** — même style que Task 2.2 (primer le cache en
  ligne, couper la connectivité mockée, vérifier la lecture en cache pour `listFeltPointsForPlan`
  ; et un test symétrique pour `createFeltPoint` vérifiant que hors-ligne, l'appel
  retourne l'objet optimiste ET ajoute une entrée dans `pending_mutations` via
  `listPendingMutations()`).
- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/data/feltPointsRepo.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation** — appliquer le patron de Chunk 3 avec
  `STORE='felt_point'`, `TABLE='felt_point'`. `createFeltPoint` génère l'id via
  `generateClientId()` et passe `{ id, plan_id: input.planId, network_name:
  input.networkName, x: input.x, y: input.y }` à l'insert. `deleteFeltPoint` utilise le
  patron delete.

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/data/feltPointsRepo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/feltPointsRepo.ts src/data/feltPointsRepo.test.ts
git commit -m "feat(offline): cache-through for feltPointsRepo"
```

### Task 3.3: Envelopper `feltSegmentsRepo`

**Files:**
- Modify: `src/data/feltSegmentsRepo.ts`
- Modify: `src/data/feltSegmentsRepo.test.ts`

Même patron que Task 3.2, `STORE='felt_segment'`, `TABLE='felt_segment'`. **A bien un
`deleteFeltSegment(id)`** (corrigé après relecture — le tableau de la Task 3.1 disait
initialement le contraire à tort) : l'envelopper avec le patron `deleteX` standard,
même si elle n'est aujourd'hui appelée par aucun composant UI (seulement testée
directement) — cohérence avec les 3 autres repos qui ont un delete. Attention à la
forme de `createFeltSegment` : le row Supabase a `ax`/`ay`/`bx`/`by`/`polarity_a`/
`polarity_b` (pas de champs imbriqués) — construire le `row` et l'`item` (objet
`FeltSegment` en camelCase avec `pointA`/`pointB` imbriqués) séparément, comme le fait
déjà `mapRowToFeltSegment`.

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/data/feltSegmentsRepo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/feltSegmentsRepo.ts src/data/feltSegmentsRepo.test.ts
git commit -m "feat(offline): cache-through for feltSegmentsRepo"
```

### Task 3.4: Envelopper `phenomenaRepo`

**Files:**
- Modify: `src/data/phenomenaRepo.ts`
- Modify: `src/data/phenomenaRepo.test.ts`

Même patron, `STORE='phenomenon'`, `TABLE='phenomenon'`, a un `deleteX`.

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/data/phenomenaRepo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/phenomenaRepo.ts src/data/phenomenaRepo.test.ts
git commit -m "feat(offline): cache-through for phenomenaRepo"
```

### Task 3.5: Envelopper `contextObjectsRepo`

**Files:**
- Modify: `src/data/contextObjectsRepo.ts`
- Modify: `src/data/contextObjectsRepo.test.ts`

Même patron, `STORE='context_object'`, `TABLE='context_object'`, a un `deleteX`.

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/data/contextObjectsRepo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/contextObjectsRepo.ts src/data/contextObjectsRepo.test.ts
git commit -m "feat(offline): cache-through for contextObjectsRepo"
```

### Task 3.6: Envelopper `freeformNetworksRepo`

**Files:**
- Modify: `src/data/freeformNetworksRepo.ts`
- Modify: `src/data/freeformNetworksRepo.test.ts`

Même patron, `STORE='freeform_network'`, `TABLE='freeform_network'`, pas de `deleteX`.
Forme vérifiée dans le code réel (`src/data/freeformNetworksRepo.ts`) :
`CreateFreeformNetworkInput { planId, kind, points: Point[], currentBearingDeg: number |
null, depthM: number | null, flowRate: string | null }`, mappé vers la row
`{ plan_id, kind, points, current_bearing_deg, depth_m, flow_rate }` — `points` est
stocké tel quel (tableau, colonne `jsonb` côté Postgres), aucune sérialisation
particulière à faire, exactement comme `theoretical_points`/`adjusted_points` dans
`grid_line`. `createFreeformNetwork` suit donc le patron `createX` standard sans
particularité ; `id` généré côté client comme les autres.

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/data/freeformNetworksRepo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/freeformNetworksRepo.ts src/data/freeformNetworksRepo.test.ts
git commit -m "feat(offline): cache-through for freeformNetworksRepo"
```

### Task 3.7: Envelopper `gridInstancesRepo` (les 3 fonctions exportées : `listGridInstancesForPlan`, `createGridInstance`, `updateGridInstanceOrigin`)

**Files:**
- Modify: `src/data/gridInstancesRepo.ts`
- Modify: `src/data/gridInstancesRepo.test.ts`

`STORE='grid_instance'`, `TABLE='grid_instance'`. **Les 3 fonctions exportées du fichier
doivent être enveloppées** (`listGridInstancesForPlan` avait été omise d'un premier jet
de cette tâche — corrigé après relecture ; le Chunk 7/Task 7.1 l'appelle directement en
supposant qu'elle est déjà cache-through, donc l'omettre ici casserait silencieusement
le préchargement des instances de grille) :
- `listGridInstancesForPlan` : patron `listXForPlan` standard (Chunk 3, en tête de
  chunk), `STORE='grid_instance'`.
- `createGridInstance` : patron `createX` standard (id généré client).
- `updateGridInstanceOrigin` : un `updateX` — utiliser `cachedWrite` avec `operation:
  'update'` : construire l'objet `GridInstance` mis à jour localement (origin_x/y
  modifiés, reste inchangé — nécessite de lire l'entrée existante du cache d'abord pour
  ne pas perdre `templateSnapshot`), puis l'appliquer via `cachedWrite`.

- [ ] **Step 1: Write the failing test** (couvrir les 3 fonctions : `listGridInstancesForPlan`
  suit le même style de test que Task 3.2 ; et le cas `updateGridInstanceOrigin`
  hors-ligne : primer le cache avec une instance complète, couper la connectivité,
  appeler `updateGridInstanceOrigin`, vérifier que `templateSnapshot` survit dans le
  cache mis à jour et que la mutation en attente porte l'objet complet, pas un delta).
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/data/gridInstancesRepo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/gridInstancesRepo.ts src/data/gridInstancesRepo.test.ts
git commit -m "feat(offline): cache-through for gridInstancesRepo"
```

**End of Chunk 3 — dispatch plan-document-reviewer before continuing.**

---

## Chunk 4: `gridLinesRepo` (cas particulier — insertion en masse, indexé par instance)

`grid_line` est indexé par `grid_instance_id`, pas `plan_id` — `cachedList`/`cachedWrite`
(qui supposent tous les deux `plan_id`, Chunk 2) ne s'appliquent pas directement. Écrire
des variantes locales dans ce fichier, à l'image de Task 2.2 pour `gridTemplatesRepo`.

**Rappel (règle posée en Task 3.1, s'applique aussi à ce chunk) :** les quatre
`if (error) throw ...` de `gridLinesRepo.ts` (`listGridLinesForInstance`,
`updateAdjustedPoints`, `updateLinePoints`, `createGridLines`) doivent tous lever un
`SupabaseQueryError` (import depuis `../offline/supabaseQueryError`), jamais une
`Error` nue — sinon une vraie erreur métier Supabase serait avalée silencieusement et
traitée à tort comme un passage hors-ligne.

### Task 4.1: Envelopper `listGridLinesForInstance` et `updateAdjustedPoints`/`updateLinePoints`

**Files:**
- Modify: `src/data/gridLinesRepo.ts`
- Modify: `src/data/gridLinesRepo.test.ts`

- [ ] **Step 1: Write the failing test** — quatre cas : `listGridLinesForInstance`
  bascule sur le cache local (indexé par `grid_instance_id`, pas `plan_id`) quand
  hors-ligne, ET rafraîchit ce même cache quand un appel en ligne réussit (comme
  `cachedList`, Task 2.1) ; `updateAdjustedPoints` — **en ligne**, applique le résultat
  retourné par Supabase au cache local (mirroring, même garantie que `cachedWrite`) ;
  `updateAdjustedPoints` **hors-ligne**, applique le changement au cache local + file
  d'attente ; `updateLinePoints` pareil pour ses deux branches (les deux partagent la
  même ligne cachée, donc écrire un test supplémentaire vérifiant qu'appliquer
  `updateAdjustedPoints` puis `updateLinePoints` en séquence hors-ligne ne s'écrasent
  pas incorrectement l'un l'autre dans le cache final).
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation** — `listGridLinesForInstance` : même
  structure que `listGridTemplates` (Task 2.2 — tenter Supabase, rafraîchir le cache sur
  succès, retomber sur le cache sur échec) mais avec un index `grid_instance_id` au lieu
  d'aucun index (lecture filtrée : `db.getAllFromIndex('grid_line',
  'grid_instance_id', gridInstanceId)`, écriture de rafraîchissement : supprimer les
  entrées existantes de cet index puis réinsérer, comme `replaceCachedItems` du Chunk 2
  mais paramétré sur cet index précis plutôt que `plan_id`). `updateAdjustedPoints`/
  `updateLinePoints` suivent chacune la même forme à deux branches que `cachedWrite`
  (Task 2.1), écrite manuellement plutôt que via le helper générique (indexation
  différente) : **en ligne**, tenter l'update Supabase, et sur succès faire `db.put`
  du résultat retourné (forme domaine complète) dans le cache — sans ce mirroring, le
  cache resterait figé sur une version périmée de la ligne après une modification
  réussie, et une panne réseau survenant juste après renverrait des données obsolètes
  au prochain `listGridLinesForInstance` hors-ligne. **Hors-ligne** (ou en cas d'échec
  réseau après tentative) : lire la ligne existante du cache (nécessaire pour ne pas
  perdre les champs non modifiés), appliquer le patch, `db.put` (forme domaine,
  camelCase, dans le cache), puis `enqueueMutation` avec un `payload` en forme ROW
  (snake_case — `{ id, adjusted_points: ... }` / `{ id, theoretical_points: ...,
  adjusted_points: ... }`), cohérent avec ce que `cachedWrite`/`sync.ts` (Chunk 2/8)
  attendent partout ailleurs — ne pas enqueue l'objet `GridLine` domaine tel quel.
- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/data/gridLinesRepo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/gridLinesRepo.ts src/data/gridLinesRepo.test.ts
git commit -m "feat(offline): cache-through for gridLinesRepo (list + both update variants)"
```

### Task 4.2: Envelopper `createGridLines` (insertion en masse)

**Files:**
- Modify: `src/data/gridLinesRepo.ts`
- Modify: `src/data/gridLinesRepo.test.ts`

`createGridLines` insère plusieurs lignes en un seul appel Supabase (génération de
grille — potentiellement des dizaines de lignes). Un id client est généré pour **chaque
ligne, inconditionnellement** (en ligne ou hors-ligne, avant toute tentative réseau —
même règle que pour tous les autres repos depuis Task 3.1) via `generateClientId()`
(Task 1.3), et injecté dans la row envoyée à `.insert(...)` (Supabase accepte un `id`
explicite au lieu de laisser `default gen_random_uuid()` le générer — migration-safety
déjà vérifiée en Task 3.1). **En ligne** : après un `.insert(...)` réussi, stocker les
lignes retournées (forme domaine) dans le cache local (`db.put` pour chacune) — sans ce
mirroring, une génération de grille faite en ligne resterait absente du cache, et une
panne réseau juste après renverrait une liste incomplète au prochain
`listGridLinesForInstance` hors-ligne. **Hors-ligne** (ou en cas d'échec réseau après
tentative) : stocker les lignes (avec leurs ids déjà générés) dans le cache local (forme
domaine, `GridLine[]`), et enqueue **une seule** mutation
`{ table: 'grid_line', operation: 'insert', payload: rows }` où `rows` est le TABLEAU DE
ROWS (snake_case, une entrée par ligne, id inclus — même mapping que fait déjà
`createGridLines` aujourd'hui pour son propre `.insert(inputs.map(...))`), pas le
tableau d'objets `GridLine` domaine — cohérent avec `sync.ts` (Chunk 8), qui rejoue ce
payload tel quel via `supabase.from('grid_line').insert(payload)` (Supabase accepte
nativement un tableau de rows en un seul appel, déjà vérifié dans ce même fichier).

- [ ] **Step 1: Write the failing test** — trois cas : hors-ligne, `createGridLines`
  avec 3 lignes en entrée retourne 3 `GridLine` avec des ids distincts valides, les 3
  sont dans le cache local, et **une seule** entrée existe dans `pending_mutations` (pas
  3) dont le `payload` est un tableau de 3 éléments avec `id` inclus dans chaque row ;
  en ligne, un `.insert(...)` réussi retourne les 3 lignes ET les 3 sont mirrorées dans
  le cache local, sans aucune entrée dans `pending_mutations`. **Mettre aussi à jour le
  test existant** `'bulk-creates grid lines with adjustedPoints initialized to
  theoreticalPoints'` (actuellement lignes 11-35 de `gridLinesRepo.test.ts`) : il assert
  aujourd'hui que `chain.insert` est appelé SANS champ `id` par row — avec la génération
  d'id client désormais inconditionnelle, cette assertion doit être corrigée pour
  attendre un `id` (string non vide) dans chaque row insérée, sinon ce test déjà
  existant va casser silencieusement une fois l'implémentation modifiée.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/data/gridLinesRepo.test.ts`
Expected: PASS (tous les tests du fichier)

- [ ] **Step 5: Commit**

```bash
git add src/data/gridLinesRepo.ts src/data/gridLinesRepo.test.ts
git commit -m "feat(offline): cache-through for gridLinesRepo.createGridLines (bulk insert)"
```

**End of Chunk 4 — dispatch plan-document-reviewer before continuing.**

---

## Chunk 5: `plansRepo.listPlansForMission` (lecture seule)

### Task 5.1: Envelopper `listPlansForMission`

**Files:**
- Modify: `src/data/plansRepo.ts`
- Modify: `src/data/plansRepo.test.ts`

Indexé par `mission_id`, pas `plan_id` (un plan n'a pas de `plan_id`, il EST le plan).
Seule `listPlansForMission` est enveloppée — `createPlan` reste strictement en ligne
(spec §4.4 : la calibration de plan intérieur et la réparation d'une mission orpheline
sans plan extérieur sont des cas de préparation, jamais nécessaires pour une mission
dont le préchargement a réussi).

- [ ] **Step 1: Write the failing test** — même style que Task 2.2, avec l'index
  `mission_id` (déjà créé dans le schéma du Task 1.2, store `plan`). **Test
  supplémentaire, obligatoire pour couvrir la correction du Step 3 ci-dessous** :
  pré-remplir le cache avec des plans pour deux missions distinctes (`mission_id: 'm1'`
  et `mission_id: 'm2'`), rafraîchir en ligne les plans d'UNE SEULE mission (`m1`), puis
  vérifier que les plans en cache de l'AUTRE mission (`m2`) sont toujours présents et
  inchangés — sans ce test, une régression vers le patron `clear()` global (celui de
  `listGridTemplates`, incorrect ici) passerait inaperçue.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation** — **attention** : `listGridTemplates`
  (Task 2.2) et `listGridLinesForInstance` (Task 4.1) ne suivent PAS le même patron de
  rafraîchissement de cache, et ce ne sont pas des alternatives interchangeables.
  `listGridTemplates` gère un référentiel global non filtré : sur succès en ligne, il
  vide TOUT le store (`tx.store.clear()`) puis réinsère — sûr uniquement parce que ce
  store ne contient jamais qu'un seul jeu de données partagé par toute l'app. `plan` est
  indexé par `mission_id` (comme `grid_line` est indexé par `grid_instance_id`) : il
  contient les données de PLUSIEURS missions à la fois dans le même store. Utiliser le
  patron `clear()` global de `listGridTemplates` ici effacerait silencieusement les
  plans en cache de toutes les autres missions à chaque rafraîchissement d'une seule
  mission — perte de données inter-missions en cache. `listPlansForMission` DOIT donc
  suivre le patron scopé par index de `listGridLinesForInstance` (Task 4.1) :
  sur succès en ligne, supprimer uniquement les entrées existantes de l'index
  `mission_id` correspondant à CE `missionId` (`db.getAllFromIndex('plan', 'mission_id',
  missionId)` puis suppression ciblée), puis réinsérer les plans retournés — jamais un
  `clear()` global.
- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/data/plansRepo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/plansRepo.ts src/data/plansRepo.test.ts
git commit -m "feat(offline): cache-through for plansRepo.listPlansForMission (read-only)"
```

**End of Chunk 5 — dispatch plan-document-reviewer before continuing.**

---

## Chunk 6: Point d'entrée hors-ligne (`current_session` + `App.tsx`)

### Task 6.1: Lire/écrire la session courante

**Files:**
- Create: `src/offline/currentSession.ts`
- Test: `src/offline/currentSession.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/offline/currentSession.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getCurrentSession, setCurrentSession } from './currentSession'
import { getDB } from './db'
import type { Mission, Plan } from '../domain/types'

const mission: Mission = {
  id: 'm1', address: 'x', missionDate: '2026-07-27', declinationDeg: null,
  originLat: 48.85, originLng: 2.35, causeArchitectural: null, causeElectromagnetique: null,
  causeGeobiologique: null, causeParanormale: null, causeAutres: null, bovisRate: 5000,
  parcelRefs: [], buildingFootprint: null,
}
const exteriorPlan: Plan = { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null }

describe('currentSession', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('current_session')
  })

  it('returns null when nothing has been stored yet', async () => {
    expect(await getCurrentSession()).toBeNull()
  })

  it('stores and retrieves the mission + exterior plan pair', async () => {
    await setCurrentSession(mission, exteriorPlan)

    const session = await getCurrentSession()
    expect(session).toEqual({ mission, exteriorPlan })
  })

  it('overwrites the previous session when called again (single-entry store)', async () => {
    await setCurrentSession(mission, exteriorPlan)
    const otherMission = { ...mission, id: 'm2' }
    await setCurrentSession(otherMission, exteriorPlan)

    const session = await getCurrentSession()
    expect(session?.mission.id).toBe('m2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/offline/currentSession.test.ts`
Expected: FAIL — `Cannot find module './currentSession'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/offline/currentSession.ts
import { getDB } from './db'
import type { Mission, Plan } from '../domain/types'

export interface CurrentSession {
  mission: Mission
  exteriorPlan: Plan
}

const SESSION_KEY = 'current'

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const db = await getDB()
  const session = await db.get('current_session', SESSION_KEY)
  return (session as CurrentSession | undefined) ?? null
}

export async function setCurrentSession(mission: Mission, exteriorPlan: Plan): Promise<void> {
  const db = await getDB()
  await db.put('current_session', { mission, exteriorPlan }, SESSION_KEY)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/offline/currentSession.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add src/offline/currentSession.ts src/offline/currentSession.test.ts
git commit -m "feat(offline): add current-session store (mission + exterior plan)"
```

### Task 6.2: Écrire `current_session` à chaque reprise réussie d'une mission en ligne

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx` (le créer s'il n'existe pas déjà — vérifier d'abord)

- [ ] **Step 1: Write the failing test**

`src/App.test.tsx` existe déjà (lu directement : il mocke `./data/missionsRepo` et
`./pages/deriveResumePhase` via `vi.mock(...)`, et mocke `MissionWorkspace` pour
rendre `<div data-testid="mission-workspace" data-resume-phase-name={...} />` — pas
de `fake-indexeddb/auto`, pas de mock de `./offline/currentSession` pour l'instant).
Ajouter au bloc d'imports/mocks en tête de fichier :

```typescript
import * as currentSessionModule from './offline/currentSession'

vi.mock('./offline/currentSession')
```

(mocker le module entier, pas `vi.spyOn` sur l'import réel — le fichier n'a pas
`fake-indexeddb/auto`, et la vraie implémentation de `setCurrentSession`
[Task 6.1] appelle `getDB()` qui échouerait dans l'environnement de test jsdom sans
polyfill IndexedDB ; mocker le module entier évite d'avoir à en ajouter un ici pour
un seul test).

Puis ajouter ce test dans le `describe('App', ...)` existant :

```typescript
it('persists the mission + exterior plan into current_session after a successful resume', async () => {
  vi.mocked(missionsRepo.listMissions).mockResolvedValue([existingMission])
  const exteriorPlan = { id: 'p1', missionId: 'm1', kind: 'exterieur' as const, imageUrl: null, calibration: null }
  vi.mocked(deriveResumePhaseModule.deriveResumePhase).mockResolvedValue({
    name: 'ready-no-interior', mission: existingMission, exteriorPlan,
  })

  render(<App />)
  fireEvent.click(await screen.findByText(/10 Rue de Rivoli/))

  await waitFor(() => expect(currentSessionModule.setCurrentSession).toHaveBeenCalledWith(existingMission, exteriorPlan))
})
```

(réutiliser `existingMission`, déjà défini dans le fichier — ne pas redéclarer une
variable `mission` distincte.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/App.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Modifier `handleSelectMission` dans `src/App.tsx` :

```typescript
import { setCurrentSession } from './offline/currentSession'

async function handleSelectMission(mission: Mission) {
  try {
    const resumePhase = await deriveResumePhase(mission)
    if (resumePhase.name === 'ready-no-interior') {
      await setCurrentSession(resumePhase.mission, resumePhase.exteriorPlan)
    }
    setPhase({ name: 'resuming', resumePhase })
  } catch (err) {
    setPhase({ name: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(offline): persist current_session on successful mission resume"
```

### Task 6.3: Point d'entrée hors-ligne — sauter `listMissions()` au montage

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write the failing test**

Ajouter au bloc d'imports/mocks en tête de fichier (en plus du mock de
`./offline/currentSession` déjà ajouté en Task 6.2) :

```typescript
import * as connectivity from './offline/connectivity'

vi.mock('./offline/connectivity')
```

Puis ajouter ces deux tests dans le `describe('App', ...)` existant. Le premier
réutilise le mock déjà en place de `MissionWorkspace` (`src/App.test.tsx:14-18`, qui
rend `<div data-testid="mission-workspace" data-resume-phase-name={...} />`) — pas de
nouveau marqueur à inventer :

```typescript
it('boots straight into the resuming phase from the cached session when offline at mount, without calling listMissions', async () => {
  const exteriorPlan = { id: 'p1', missionId: 'm1', kind: 'exterieur' as const, imageUrl: null, calibration: null }
  vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
  vi.mocked(currentSessionModule.getCurrentSession).mockResolvedValue({ mission: existingMission, exteriorPlan })

  render(<App />)

  const workspace = await screen.findByTestId('mission-workspace')
  expect(workspace).toHaveAttribute('data-resume-phase-name', 'ready-no-interior')
  expect(missionsRepo.listMissions).not.toHaveBeenCalled()
})

it('falls back to the normal listMissions() flow when offline at mount but no session is cached', async () => {
  vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
  vi.mocked(currentSessionModule.getCurrentSession).mockResolvedValue(null)
  vi.mocked(missionsRepo.listMissions).mockRejectedValue(new Error('network down'))

  render(<App />)

  expect(await screen.findByRole('alert')).toHaveTextContent('network down')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/App.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/App.tsx — modifier le useEffect de montage
import { isOnlineNow } from './offline/connectivity'
import { getCurrentSession } from './offline/currentSession'

useEffect(() => {
  async function boot() {
    if (!(await isOnlineNow())) {
      const cached = await getCurrentSession()
      if (cached) {
        setPhase({
          name: 'resuming',
          resumePhase: { name: 'ready-no-interior', mission: cached.mission, exteriorPlan: cached.exteriorPlan },
        })
        return
      }
      // pas de session en cache — retombe sur le chemin existant (listMissions
      // échouera, phase 'error', comportement inchangé, spec §4.4 "cas limite")
    }
    listMissions()
      .then((missions) => setPhase({ name: 'mission-list', missions }))
      .catch((err) => setPhase({ name: 'error', message: err instanceof Error ? err.message : String(err) }))
  }
  boot()
}, [])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/App.test.tsx`
Expected: PASS (tous les tests du fichier)

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(offline): boot straight into a cached mission when offline at mount"
```

**End of Chunk 6 — dispatch plan-document-reviewer before continuing.**

---

## Chunk 7: Préchargement automatique à la sélection des parcelles

### Task 7.1: Fonction de préchargement complet d'un plan

**Files:**
- Create: `src/offline/preload.ts`
- Test: `src/offline/preload.test.ts`

Appelle chacun des `listXForPlan` déjà cache-through (Chunks 3-5) une fois pour amorcer
leurs caches respectifs — c'est le même effet que "les appeler une fois en ligne", donc
aucune nouvelle logique de cache n'est nécessaire ici pour ces listes, juste
l'orchestration des appels. **En plus de ça**, la spec (§4.4) précise explicitement que
le préchargement stocke AUSSI la paire `{ mission, exteriorPlan }` dans
`current_session` (Task 6.1) — c'est cet appel qui rend une mission fraîchement préparée
(parcelles confirmées) immédiatement utilisable hors-ligne, sans jamais être passée par
`App.tsx`/`handleSelectMission` (Task 6.2) qui n'écrit `current_session` qu'à une
REPRISE ultérieure d'une mission déjà existante. Sans cet appel ici, un technicien qui
prépare une mission puis part directement sur site dans la même session (sans jamais
revenir à la liste des missions) n'aurait aucune `current_session` en cache, et le
démarrage hors-ligne (Task 6.3) échouerait pour ce cas pourtant le plus courant.
`preloadPlanForOffline` prend donc directement `mission`/`exteriorPlan` (pas de simples
`planId`/`missionId`) pour pouvoir les passer à `setCurrentSession`.

- [ ] **Step 1: Write the failing test** — mocker chaque `listXForPlan` et
  `setCurrentSession`, appeler `preloadPlanForOffline(mission, exteriorPlan)`, vérifier
  que chacun a été appelé une fois avec le bon `planId`/`missionId` (dérivés de
  `exteriorPlan.id`/`mission.id`), que `listGridLinesForInstance` est appelé pour chaque
  instance retournée par `listGridInstancesForPlan` (pas juste une fois à vide), et que
  `setCurrentSession` a été appelé exactement une fois avec `(mission, exteriorPlan)`.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**

```typescript
// src/offline/preload.ts
import { listGridTemplates } from '../data/gridTemplatesRepo'
import { listGridInstancesForPlan } from '../data/gridInstancesRepo'
import { listGridLinesForInstance } from '../data/gridLinesRepo'
import { listFeltPointsForPlan } from '../data/feltPointsRepo'
import { listFeltSegmentsForPlan } from '../data/feltSegmentsRepo'
import { listPhenomenaForPlan } from '../data/phenomenaRepo'
import { listContextObjectsForPlan } from '../data/contextObjectsRepo'
import { listFreeformNetworksForPlan } from '../data/freeformNetworksRepo'
import { listPlansForMission } from '../data/plansRepo'
import { setCurrentSession } from './currentSession'
import type { Mission, Plan } from '../domain/types'

export async function preloadPlanForOffline(mission: Mission, exteriorPlan: Plan): Promise<void> {
  const planId = exteriorPlan.id
  const [instances] = await Promise.all([
    listGridInstancesForPlan(planId),
    listGridTemplates(),
    listFeltPointsForPlan(planId),
    listFeltSegmentsForPlan(planId),
    listPhenomenaForPlan(planId),
    listContextObjectsForPlan(planId),
    listFreeformNetworksForPlan(planId),
    listPlansForMission(mission.id),
  ])
  await Promise.all(instances.map((i) => listGridLinesForInstance(i.id)))
  await setCurrentSession(mission, exteriorPlan)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/offline/preload.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/offline/preload.ts src/offline/preload.test.ts
git commit -m "feat(offline): add full-plan preload orchestration"
```

### Task 7.2: Déclencher le préchargement à la confirmation des parcelles

**Files:**
- Modify: `src/pages/MissionWorkspace.tsx` (fonction `handleParcelsSelected`, déjà
  existante depuis le chantier parcel-selection de cette semaine)
- Modify: `src/pages/MissionWorkspace.test.tsx`

- [ ] **Step 1: Write the failing test** — `MissionWorkspace.test.tsx` mocke déjà
  `plansRepo`/`missionsRepo` en entier via `vi.mock(...)` (vérifier son en-tête
  existant) ; ajouter `vi.mock('../offline/preload')` et un
  `import * as preloadModule from '../offline/preload'` du même style, sans quoi
  l'implémentation réelle de `preloadPlanForOffline` (Task 7.1) s'exécuterait pour de
  vrai en tâche de fond pendant CE test et tout autre test de confirmation de parcelles
  du fichier (elle est appelée en fire-and-forget, donc ne ferait pas planter le test de
  façon synchrone, mais déclencherait des appels réseau/repo réels non mockés). Dans le
  test existant de `handleParcelsSelected` (chercher `describe`/`it` mentionnant
  "parcel" dans `MissionWorkspace.test.tsx`), ajouter une assertion que
  `preloadPlanForOffline` est appelé avec la mission mise à jour (`updated`, celle
  retournée par `setSelectedParcels`) et le `exteriorPlan` de la phase courante, une
  fois la sélection confirmée.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation** — appeler
  `preloadPlanForOffline(updated, phase.exteriorPlan)` (sans attendre son résultat de
  façon bloquante — `.catch(() => {})` en fond, une erreur de préchargement ne doit pas
  empêcher la mission de s'ouvrir normalement en ligne) dans `handleParcelsSelected`,
  juste après l'affectation de `updated` (le résultat de `setSelectedParcels`) — `updated`
  est déjà la variable en scope à cet endroit (`src/pages/MissionWorkspace.tsx:104`),
  pas besoin d'en dériver une autre.
- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/pages/MissionWorkspace.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/MissionWorkspace.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "feat(offline): trigger preload automatically on parcel-selection confirm"
```

**End of Chunk 7 — dispatch plan-document-reviewer before continuing.**

---

## Chunk 8: Synchronisation automatique + indicateur UI

### Task 8.1: Rejouer la file d'attente

**Files:**
- Create: `src/offline/sync.ts`
- Test: `src/offline/sync.test.ts`

- [ ] **Step 1: Write the failing test** — vérifier : rejoue les mutations en ordre
  FIFO ; une mutation réussie est retirée de la file ; une mutation qui échoue incrémente
  `attempts` et reste en file, SANS bloquer les suivantes ; le cas particulier
  `grid_line`/`insert` avec un payload tableau (Task 4.2) rejoue via
  `supabase.from('grid_line').insert(payload)` (le tableau entier en un appel, pas une
  boucle).
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**

```typescript
// src/offline/sync.ts
import { supabase } from '../lib/supabaseClient'
import { listPendingMutations, removePendingMutation, incrementAttempts } from './pendingMutations'

// `mutation.payload` is already in Supabase row form (snake_case) — cachedWrite
// (Chunk 2, Task 2.1) converts it via each repo's own `toRow` before enqueueing,
// specifically so this module can stay generic and never needs per-table
// mapping knowledge of its own.
export async function flushPendingMutations(): Promise<void> {
  const pending = await listPendingMutations()
  for (const mutation of pending) {
    try {
      if (mutation.operation === 'insert') {
        const { error } = await supabase.from(mutation.table).insert(mutation.payload as never)
        if (error) throw new Error(error.message)
      } else if (mutation.operation === 'update') {
        const { id, ...patch } = mutation.payload as { id: string }
        const { error } = await supabase.from(mutation.table).update(patch).eq('id', id)
        if (error) throw new Error(error.message)
      } else {
        const { id } = mutation.payload as { id: string }
        const { error } = await supabase.from(mutation.table).delete().eq('id', id)
        if (error) throw new Error(error.message)
      }
      await removePendingMutation(mutation.id)
    } catch {
      await incrementAttempts(mutation.id)
      // ne bloque pas les mutations suivantes — continue la boucle
    }
  }
}
```

Note pour l'implémenteur : `mutation.payload` pour une insertion en masse
`grid_line` (Task 4.2) est un TABLEAU de rows, pas une row unique —
`supabase.from('grid_line').insert(payload)` accepte nativement un tableau en un
seul appel (déjà le comportement de `createGridLines` aujourd'hui), donc aucune
branche spéciale n'est nécessaire dans `flushPendingMutations` pour ce cas : le
même code `insert(mutation.payload as never)` fonctionne pour une row unique ou
un tableau de rows.

Note sur le traitement des erreurs — délibérément SANS distinction
`SupabaseQueryError`/échec réseau ici, contrairement aux repos des chunks 2-5 : la
spec §4.6 dit explicitement qu'"une erreur de synchro individuelle (ex. donnée
désormais invalide côté serveur) incrémente `attempts` et reste dans la file plutôt
que de bloquer les suivantes" — c'est-à-dire que les deux catégories d'erreur
(échec réseau transitoire ET vraie erreur métier permanente) reçoivent volontairement
le MÊME traitement ici (incrémenter `attempts`, laisser l'entrée en file, continuer la
boucle). La distinction `SupabaseQueryError` sert à `cachedList`/`cachedWrite` à
décider s'il faut basculer sur le cache local ou non (Chunk 2) ; `flushPendingMutations`
n'a pas ce choix à faire (l'écriture est déjà faite localement, il ne reste qu'à
rejouer), donc la distinction n'est pas nécessaire ici. Un plafond de tentatives ou un
mécanisme d'escalade au-delà de ce que la spec décrit est explicitement hors périmètre
de ce plan (YAGNI).

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/offline/sync.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/offline/sync.ts src/offline/sync.test.ts
git commit -m "feat(offline): replay pending mutations to Supabase on sync"
```

Note : cette tâche ne modifie ni `cacheThrough.ts` ni aucun fichier de `src/data/*.ts`
— `sync.ts` est un nouveau fichier autonome qui ne fait que lire `pending_mutations` et
rejouer les payloads déjà en forme ROW (aucune connaissance des repos). Ne pas inclure
ces fichiers dans le commit de cette tâche.

### Task 8.2: Hook de synchronisation automatique

**Files:**
- Create: `src/hooks/useOfflineSync.ts`
- Test: `src/hooks/useOfflineSync.test.ts`

- [ ] **Step 1: Write the failing test** — trois cas : (a) au montage, si déjà en ligne
  (`isOnlineNow()` résout `true`) ET qu'il y a des mutations en attente, `
  flushPendingMutations` est appelé automatiquement sans attendre d'évènement —
  c'est le cas d'une session terminée hors-ligne sur le terrain puis l'app rouverte
  plus tard déjà connectée (au bureau), aucune transition offline→online n'a lieu dans
  CETTE session donc il ne faut pas dépendre uniquement de l'évènement `'online'` ; (b)
  un évènement `window` `'online'` déclenche `isOnlineNow()`, et SEULEMENT s'il résout
  `true` (pas seulement parce que l'évènement s'est déclenché — `navigator.onLine` peut
  mentir, spec §4.3 — ex. connecté à un routeur local sans accès WAN réel), appelle
  `flushPendingMutations` ; si `isOnlineNow()` résout `false` malgré l'évènement
  `'online'`, ne PAS appeler `flushPendingMutations` ; (c) le hook expose un compte de
  mutations en attente qui se met à jour après un flush réussi.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**

```typescript
// src/hooks/useOfflineSync.ts
import { useEffect, useState, useCallback, useRef } from 'react'
import { flushPendingMutations } from '../offline/sync'
import { listPendingMutations } from '../offline/pendingMutations'
import { isOnlineNow } from '../offline/connectivity'

export function useOfflineSync() {
  const [pendingCount, setPendingCount] = useState(0)
  const flushInProgress = useRef(false)

  const refreshCount = useCallback(async () => {
    setPendingCount((await listPendingMutations()).length)
  }, [])

  const flushIfOnline = useCallback(async () => {
    if (flushInProgress.current) return
    if (await isOnlineNow()) {
      flushInProgress.current = true
      try {
        await flushPendingMutations()
        await refreshCount()
      } finally {
        flushInProgress.current = false
      }
    }
  }, [refreshCount])

  useEffect(() => {
    refreshCount().then(flushIfOnline)
    window.addEventListener('online', flushIfOnline)
    return () => window.removeEventListener('online', flushIfOnline)
  }, [refreshCount, flushIfOnline])

  return { pendingCount }
}
```

`flushIfOnline` re-vérifie `isOnlineNow()` (la vraie sonde réseau, pas seulement
`navigator.onLine`) avant de tenter la synchro, aussi bien au montage qu'à réception de
l'évènement `'online'` — sans ça, un évènement `'online'` déclenché par un simple
changement de réseau local (sans accès WAN réel) lancerait une synchro vouée à échouer
pour chaque mutation en attente, incrémentant inutilement leur `attempts`. Au montage,
`refreshCount().then(flushIfOnline)` couvre le cas où l'app est rouverte déjà en ligne
avec une file d'attente issue d'une session hors-ligne précédente — sans cet appel au
montage, ces mutations resteraient bloquées indéfiniment tant qu'aucune transition
offline→online ne se produit pendant la session courante, ce qui contredirait
l'exigence "synchronisation automatique, sans action de Laurent" (spec §1).
Le garde-fou `flushInProgress` empêche deux flushes concurrents (ex. le montage et
l'évènement `'online'` se déclenchant au même instant) : sans lui, les deux appels
liraient la même file en attente et rejoueraient la même mutation deux fois — pour un
`insert`, le perdant recevrait une erreur de clé dupliquée de Supabase et
incrémenterait `attempts` sur une entrée déjà réussie côté serveur, la laissant
échouer indéfiniment à chaque tentative future.

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/hooks/useOfflineSync.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useOfflineSync.ts src/hooks/useOfflineSync.test.ts
git commit -m "feat(offline): add useOfflineSync hook (auto-sync on reconnect)"
```

### Task 8.3: Indicateur UI

**Files:**
- Create: `src/components/OfflineIndicator.tsx`
- Test: `src/components/OfflineIndicator.test.tsx`
- Modify: `src/App.tsx` (monter `<OfflineIndicator />` une fois, au niveau racine)

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/OfflineIndicator.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OfflineIndicator } from './OfflineIndicator'
import * as useOfflineSyncModule from '../hooks/useOfflineSync'

vi.mock('../hooks/useOfflineSync')

describe('OfflineIndicator', () => {
  it('shows "Synchronisé" when there are no pending mutations', () => {
    vi.mocked(useOfflineSyncModule.useOfflineSync).mockReturnValue({ pendingCount: 0 })
    render(<OfflineIndicator />)
    expect(screen.getByText('Synchronisé')).toBeInTheDocument()
  })

  it('shows the pending count when there are queued mutations', () => {
    vi.mocked(useOfflineSyncModule.useOfflineSync).mockReturnValue({ pendingCount: 3 })
    render(<OfflineIndicator />)
    expect(screen.getByText(/3.*en attente/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/components/OfflineIndicator.test.tsx`
Expected: FAIL — `Cannot find module './OfflineIndicator'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/components/OfflineIndicator.tsx
import { useOfflineSync } from '../hooks/useOfflineSync'

const STYLE = {
  position: 'fixed' as const,
  bottom: 8,
  right: 8,
  background: '#fff3cd',
  border: '1px solid #ffc107',
  padding: '4px 8px',
  borderRadius: 4,
  fontSize: 12,
  zIndex: 2000,
}

export function OfflineIndicator() {
  const { pendingCount } = useOfflineSync()
  const message = pendingCount === 0 ? 'Synchronisé' : `Hors-ligne — ${pendingCount} modification(s) en attente`
  return <div style={STYLE}>{message}</div>
}
```

Indicateur **permanent** (spec §4.7 : "Petit indicateur permanent et discret... `Hors-
ligne — N modification(s) en attente` ou `Synchronisé`") — toujours affiché, jamais
`null`, contrairement à une version qui se cacherait quand `pendingCount === 0`. Le nom
du composant ("Offline") est trompeur une fois ce comportement en place : il affiche en
réalité l'état de synchro global (à jour vs. en attente), pas seulement le hors-ligne —
conservé tel quel ici par cohérence avec le nom de fichier déjà fixé dans le plan, un
renommage éventuel est laissé à l'implémenteur s'il le juge utile.

Puis dans `src/App.tsx`, ajouter `<OfflineIndicator />` dans le JSX racine (frère du
`<div style={{ height: '100vh', ... }}>` existant, pas à l'intérieur — doit rester
visible quelle que soit la phase de l'app).

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/components/OfflineIndicator.test.tsx`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add src/components/OfflineIndicator.tsx src/components/OfflineIndicator.test.tsx src/App.tsx
git commit -m "feat(offline): add offline/pending-sync indicator"
```

**End of Chunk 8 — dispatch plan-document-reviewer.**

---

## Vérification finale (tout le plan)

- [ ] Run: `node_modules/.bin/vitest.cmd run` — attendu : suite complète verte
- [ ] Run: `node_modules/.bin/tsc.cmd --noEmit -p tsconfig.app.json` — attendu : aucune erreur
- [ ] Vérification manuelle en direct (spec §7, discipline déjà établie sur ce projet) :
  ouvrir une mission déjà préchargée, couper réellement le réseau (pas juste mocker),
  vérifier que le relevé terrain reste utilisable, replacer le réseau, vérifier que
  l'indicateur revient à zéro et que les données créées hors-ligne apparaissent bien
  dans Supabase.
- [ ] Recharger la page complètement pendant que le réseau est coupé, vérifier que
  l'app retombe directement dans la mission en cours (pas l'écran de liste).

Photos (upload hors-ligne) : hors de ce plan, itération séparée future (spec §1/§6).
