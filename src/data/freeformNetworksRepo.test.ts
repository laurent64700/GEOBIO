import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createFreeformNetwork, listFreeformNetworksForPlan } from './freeformNetworksRepo'
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
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        plan_id: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        current_bearing_deg: 45, depth_m: 2.5, flow_rate: 'faible',
      })
    )
    // id and created_at are now generated client-side, unconditionally,
    // before the network attempt (spec §4.1) — assert shape, not a fixed value.
    const insertedRow = chain.insert.mock.calls[0][0]
    expect(insertedRow.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(typeof insertedRow.created_at).toBe('string')
    expect(network.id).toBe('fn1')
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

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        plan_id: 'p1', kind: 'faille', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        current_bearing_deg: null, depth_m: null, flow_rate: null,
      })
    )
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

describe('freeformNetworksRepo — offline behavior', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('freeform_network')
    await db.clear('pending_mutations')
  })

  it('falls back to the local cache when the online fetch fails, after having cached it once online', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const { from } = createSupabaseChainMock({
      data: [{
        id: 'fn1', plan_id: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }],
        current_bearing_deg: null, depth_m: null, flow_rate: null, created_at: '2026-07-21T10:00:00Z',
      }],
      error: null,
    })
    vi.mocked(supabase).from = from
    await listFreeformNetworksForPlan('p1') // primes the cache while "online"

    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const networks = await listFreeformNetworksForPlan('p1')

    expect(networks).toHaveLength(1)
    expect(networks[0].kind).toBe('eau')
  })

  it('returns the optimistic network and queues a pending mutation when creating offline', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const writerFrom = vi.fn()
    vi.mocked(supabase).from = writerFrom

    const network = await createFreeformNetwork({
      planId: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      currentBearingDeg: 45, depthM: 2.5, flowRate: 'faible',
    })

    expect(writerFrom).not.toHaveBeenCalled()
    expect(network.planId).toBe('p1')
    expect(network.points).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }])

    const pending = await listPendingMutations()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ table: 'freeform_network', operation: 'insert' })
    expect(pending[0].payload).toMatchObject({
      plan_id: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      current_bearing_deg: 45, depth_m: 2.5, flow_rate: 'faible',
    })

    const db = await getDB()
    expect(await db.get('freeform_network', network.id)).toEqual(network)
  })
})
