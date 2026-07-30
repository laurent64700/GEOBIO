import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createPhenomenon, deletePhenomenon, listPhenomenaForPlan, restorePhenomenon } from './phenomenaRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'
import { getDB } from '../offline/db'
import { listPendingMutations } from '../offline/pendingMutations'
import * as connectivity from '../offline/connectivity'
import { getEntriesForPlan } from '../offline/actionHistory'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../offline/connectivity')

// See gridTemplatesRepo.test.ts for why this root-level beforeEach exists:
// the auto-mock of isOnlineNow resolves undefined (falsy) by default, which
// would silently divert every pre-existing online-path test into the
// offline branch.
beforeEach(() => {
  vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
})

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
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ plan_id: 'p1', kind: 'spire-vortex', x: 1, y: 2 })
    )
    // id and created_at are now generated client-side, unconditionally,
    // before the network attempt (spec §4.1) — assert shape, not a fixed value.
    const insertedRow = chain.insert.mock.calls[0][0]
    expect(insertedRow.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(typeof insertedRow.created_at).toBe('string')
    expect(phenomenon.id).toBe('ph1')
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
    const db = await getDB()
    await db.put('phenomenon', {
      id: 'ph1', planId: 'p1', kind: 'spire-vortex', x: 1, y: 1, createdAt: '2026-07-16T10:00:00Z',
    })
    const { from, chain } = createSupabaseChainMock({ data: null, error: null })
    vi.mocked(supabase).from = from

    await deletePhenomenon('ph1')

    expect(from).toHaveBeenCalledWith('phenomenon')
    expect(chain.eq).toHaveBeenCalledWith('id', 'ph1')
  })

  it('throws a descriptive French error when deletion fails', async () => {
    const db = await getDB()
    await db.put('phenomenon', {
      id: 'ph1', planId: 'p1', kind: 'spire-vortex', x: 1, y: 1, createdAt: '2026-07-16T10:00:00Z',
    })
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(deletePhenomenon('ph1')).rejects.toThrow(
      'Impossible de supprimer le phénomène : network down'
    )
  })
})

describe('phenomenaRepo — offline behavior', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('phenomenon')
    await db.clear('pending_mutations')
  })

  it('falls back to the local cache when the online fetch fails, after having cached it once online', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const { from } = createSupabaseChainMock({
      data: [{ id: 'ph1', plan_id: 'p1', kind: 'tube-magique', x: 0, y: 0, created_at: '2026-07-21T10:00:00Z' }],
      error: null,
    })
    vi.mocked(supabase).from = from
    await listPhenomenaForPlan('p1') // primes the cache while "online"

    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const phenomena = await listPhenomenaForPlan('p1')

    expect(phenomena).toHaveLength(1)
    expect(phenomena[0].kind).toBe('tube-magique')
  })

  it('returns the optimistic phenomenon and queues a pending mutation when creating offline', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const writerFrom = vi.fn()
    vi.mocked(supabase).from = writerFrom

    const phenomenon = await createPhenomenon({ planId: 'p1', kind: 'spire-vortex', x: 1, y: 2 })

    expect(writerFrom).not.toHaveBeenCalled()
    expect(phenomenon.planId).toBe('p1')
    expect(phenomenon.kind).toBe('spire-vortex')

    const pending = await listPendingMutations()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ table: 'phenomenon', operation: 'insert' })
    expect(pending[0].payload).toMatchObject({ plan_id: 'p1', kind: 'spire-vortex', x: 1, y: 2 })

    const db = await getDB()
    expect(await db.get('phenomenon', phenomenon.id)).toEqual(phenomenon)
  })
})

describe('phenomenaRepo — undo/redo integration', () => {
  const phenomenon = {
    id: 'ph1', planId: 'p1', kind: 'spire-vortex' as const, x: 1, y: 1, createdAt: '2026-07-16T10:00:00Z',
  }

  beforeEach(async () => {
    const db = await getDB()
    await db.clear('phenomenon')
    await db.clear('pending_mutations')
    await db.clear('action_history')
  })

  it('restorePhenomenon reinserts with the SAME id (not a freshly generated one)', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: { id: 'ph1', plan_id: 'p1', kind: 'spire-vortex', x: 1, y: 1, created_at: '2026-07-16T10:00:00Z' },
      error: null,
    })
    vi.mocked(supabase).from = from

    const restored = await restorePhenomenon(phenomenon)

    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'ph1' }))
    expect(restored.id).toBe('ph1')
    const db = await getDB()
    expect(await db.get('phenomenon', 'ph1')).toBeDefined()
  })

  it('createPhenomenon records an insert entry by default', async () => {
    const { from } = createSupabaseChainMock({
      data: { id: 'ph1', plan_id: 'p1', kind: 'spire-vortex', x: 1, y: 1, created_at: '2026-07-16T10:00:00Z' },
      error: null,
    })
    vi.mocked(supabase).from = from

    await createPhenomenon({ planId: 'p1', kind: 'spire-vortex', x: 1, y: 1 })

    const entries = await getEntriesForPlan('p1')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ entityType: 'phenomenon', operation: 'insert' })
  })

  it('createPhenomenon does NOT record an entry when options.record is false', async () => {
    const { from } = createSupabaseChainMock({
      data: { id: 'ph1', plan_id: 'p1', kind: 'spire-vortex', x: 1, y: 1, created_at: '2026-07-16T10:00:00Z' },
      error: null,
    })
    vi.mocked(supabase).from = from

    await createPhenomenon({ planId: 'p1', kind: 'spire-vortex', x: 1, y: 1 }, { record: false })

    expect(await getEntriesForPlan('p1')).toHaveLength(0)
  })

  it('deletePhenomenon records a delete entry with before = the full pre-deletion object', async () => {
    const db = await getDB()
    await db.put('phenomenon', phenomenon)
    vi.mocked(supabase).from = createSupabaseChainMock({ data: null, error: null }).from

    await deletePhenomenon('ph1')

    const entries = await getEntriesForPlan('p1')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ entityType: 'phenomenon', operation: 'delete', before: phenomenon, after: null })
  })

  it('deletePhenomenon does NOT record an entry when options.record is false', async () => {
    const db = await getDB()
    await db.put('phenomenon', phenomenon)
    vi.mocked(supabase).from = createSupabaseChainMock({ data: null, error: null }).from

    await deletePhenomenon('ph1', { record: false })

    expect(await getEntriesForPlan('p1')).toHaveLength(0)
  })

  it('deletePhenomenon throws a clear error when the phenomenon is not in the local cache', async () => {
    await expect(deletePhenomenon('missing-id')).rejects.toThrow()
  })
})
