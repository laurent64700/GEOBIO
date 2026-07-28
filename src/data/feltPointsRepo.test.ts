import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createFeltPoint, deleteFeltPoint, listFeltPointsForPlan } from './feltPointsRepo'
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

describe('feltPointsRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a felt point', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'fp1', plan_id: 'p1', network_name: 'Hartmann',
        x: 1.2, y: -3.4, created_at: '2026-07-16T10:00:00Z',
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const point = await createFeltPoint({ planId: 'p1', networkName: 'Hartmann', x: 1.2, y: -3.4 })

    expect(from).toHaveBeenCalledWith('felt_point')
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ plan_id: 'p1', network_name: 'Hartmann', x: 1.2, y: -3.4 })
    )
    // id and created_at are now generated client-side, unconditionally,
    // before the network attempt (spec §4.1) — assert shape, not a fixed value.
    const insertedRow = chain.insert.mock.calls[0][0]
    expect(insertedRow.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(typeof insertedRow.created_at).toBe('string')
    // the returned domain object still reflects what the server actually stored
    expect(point.id).toBe('fp1')
    expect(point.networkName).toBe('Hartmann')
  })

  it('throws a descriptive French error when creation fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(
      createFeltPoint({ planId: 'p1', networkName: 'Hartmann', x: 0, y: 0 })
    ).rejects.toThrow("Impossible d'enregistrer le point ressenti : network down")
  })

  it('lists felt points scoped to a plan', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [
        { id: 'fp1', plan_id: 'p1', network_name: 'Hartmann', x: 0, y: 0, created_at: '2026-07-16T10:00:00Z' },
        { id: 'fp2', plan_id: 'p1', network_name: 'Curry', x: 1, y: 1, created_at: '2026-07-16T10:05:00Z' },
      ],
      error: null,
    })
    vi.mocked(supabase).from = from

    const points = await listFeltPointsForPlan('p1')

    expect(chain.eq).toHaveBeenCalledWith('plan_id', 'p1')
    expect(points).toHaveLength(2)
    expect(points.map((p) => p.networkName)).toEqual(['Hartmann', 'Curry'])
  })

  it('throws a descriptive French error when listing fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(listFeltPointsForPlan('p1')).rejects.toThrow(
      'Impossible de charger les points ressentis : network down'
    )
  })

  it('deletes a felt point', async () => {
    const { from, chain } = createSupabaseChainMock({ data: { id: 'fp1' }, error: null })
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
})

describe('feltPointsRepo — offline behavior', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('felt_point')
    await db.clear('pending_mutations')
  })

  it('falls back to the local cache when the online fetch fails, after having cached it once online', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const { from } = createSupabaseChainMock({
      data: [{ id: 'fp1', plan_id: 'p1', network_name: 'Hartmann', x: 0, y: 0, created_at: '2026-07-16T10:00:00Z' }],
      error: null,
    })
    vi.mocked(supabase).from = from
    await listFeltPointsForPlan('p1') // primes the cache while "online"

    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const points = await listFeltPointsForPlan('p1')

    expect(points).toHaveLength(1)
    expect(points[0].networkName).toBe('Hartmann')
  })

  it('returns the optimistic point and queues a pending mutation when creating offline', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const writerFrom = vi.fn()
    vi.mocked(supabase).from = writerFrom

    const point = await createFeltPoint({ planId: 'p1', networkName: 'Hartmann', x: 1, y: 2 })

    expect(writerFrom).not.toHaveBeenCalled()
    expect(point.planId).toBe('p1')
    expect(point.networkName).toBe('Hartmann')

    const pending = await listPendingMutations()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ table: 'felt_point', operation: 'insert' })
    expect(pending[0].payload).toMatchObject({ plan_id: 'p1', network_name: 'Hartmann', x: 1, y: 2 })

    const db = await getDB()
    expect(await db.get('felt_point', point.id)).toEqual(point)
  })
})
