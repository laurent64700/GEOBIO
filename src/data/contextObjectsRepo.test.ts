import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createContextObject, deleteContextObject, listContextObjectsForPlan } from './contextObjectsRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'
import { getDB } from '../offline/db'
import { listPendingMutations } from '../offline/pendingMutations'
import * as connectivity from '../offline/connectivity'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../offline/connectivity')

// See gridTemplatesRepo.test.ts for why this root-level beforeEach exists:
// the auto-mock of isOnlineNow resolves undefined (falsy) by default, which
// would silently divert every pre-existing online-path test into the
// offline branch.
beforeEach(() => {
  vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
})

describe('contextObjectsRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a context object', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: { id: 'co1', plan_id: 'p1', kind: 'arbre-chene', x: 1, y: 2, created_at: '2026-07-27T10:00:00Z' },
      error: null,
    })
    vi.mocked(supabase).from = from

    const obj = await createContextObject({ planId: 'p1', kind: 'arbre-chene', x: 1, y: 2 })

    expect(from).toHaveBeenCalledWith('context_object')
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ plan_id: 'p1', kind: 'arbre-chene', x: 1, y: 2 })
    )
    // id and created_at are now generated client-side, unconditionally,
    // before the network attempt (spec §4.1) — assert shape, not a fixed value.
    const insertedRow = chain.insert.mock.calls[0][0]
    expect(insertedRow.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(typeof insertedRow.created_at).toBe('string')
    expect(obj.id).toBe('co1')
    expect(obj.kind).toBe('arbre-chene')
  })

  it('throws a descriptive French error when creation fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(
      createContextObject({ planId: 'p1', kind: 'canape', x: 0, y: 0 })
    ).rejects.toThrow("Impossible d'enregistrer l'objet de contexte : network down")
  })

  it('lists context objects scoped to a plan', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [{ id: 'co1', plan_id: 'p1', kind: 'puits', x: 0, y: 0, created_at: '2026-07-27T10:00:00Z' }],
      error: null,
    })
    vi.mocked(supabase).from = from

    const objects = await listContextObjectsForPlan('p1')

    expect(chain.eq).toHaveBeenCalledWith('plan_id', 'p1')
    expect(objects).toHaveLength(1)
    expect(objects[0].kind).toBe('puits')
  })

  it('deletes a context object', async () => {
    const { from, chain } = createSupabaseChainMock({ data: null, error: null })
    vi.mocked(supabase).from = from

    await deleteContextObject('co1')

    expect(from).toHaveBeenCalledWith('context_object')
    expect(chain.eq).toHaveBeenCalledWith('id', 'co1')
  })

  it('throws a descriptive French error when deletion fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(deleteContextObject('co1')).rejects.toThrow(
      "Impossible de supprimer l'objet de contexte : network down"
    )
  })
})

describe('contextObjectsRepo — offline behavior', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('context_object')
    await db.clear('pending_mutations')
  })

  it('falls back to the local cache when the online fetch fails, after having cached it once online', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const { from } = createSupabaseChainMock({
      data: [{ id: 'co1', plan_id: 'p1', kind: 'puits', x: 0, y: 0, created_at: '2026-07-27T10:00:00Z' }],
      error: null,
    })
    vi.mocked(supabase).from = from
    await listContextObjectsForPlan('p1') // primes the cache while "online"

    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const objects = await listContextObjectsForPlan('p1')

    expect(objects).toHaveLength(1)
    expect(objects[0].kind).toBe('puits')
  })

  it('returns the optimistic object and queues a pending mutation when creating offline', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const writerFrom = vi.fn()
    vi.mocked(supabase).from = writerFrom

    const obj = await createContextObject({ planId: 'p1', kind: 'arbre-chene', x: 1, y: 2 })

    expect(writerFrom).not.toHaveBeenCalled()
    expect(obj.planId).toBe('p1')
    expect(obj.kind).toBe('arbre-chene')

    const pending = await listPendingMutations()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ table: 'context_object', operation: 'insert' })
    expect(pending[0].payload).toMatchObject({ plan_id: 'p1', kind: 'arbre-chene', x: 1, y: 2 })

    const db = await getDB()
    expect(await db.get('context_object', obj.id)).toEqual(obj)
  })
})
