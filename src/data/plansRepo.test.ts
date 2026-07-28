// src/data/plansRepo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createPlan, listPlansForMission } from './plansRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'
import { getDB } from '../offline/db'
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

describe('plansRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
  })

  it('creates an exterior plan with no image/calibration', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: { id: 'p1', mission_id: 'm1', kind: 'exterieur', image_url: null, calibration: null },
      error: null,
    })
    vi.mocked(supabase).from = from

    const plan = await createPlan({ missionId: 'm1', kind: 'exterieur' })

    expect(from).toHaveBeenCalledWith('plan')
    expect(chain.insert).toHaveBeenCalledWith({
      mission_id: 'm1',
      kind: 'exterieur',
      image_url: null,
      calibration: null,
    })
    expect(plan).toEqual({ id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null })
  })

  it('throws a descriptive French error when creation fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(createPlan({ missionId: 'm1', kind: 'exterieur' })).rejects.toThrow(
      'Impossible de créer le plan : network down'
    )
  })

  it('lists plans scoped to a mission', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [{ id: 'p1', mission_id: 'm1', kind: 'exterieur', image_url: null, calibration: null }],
      error: null,
    })
    vi.mocked(supabase).from = from

    const plans = await listPlansForMission('m1')

    expect(chain.eq).toHaveBeenCalledWith('mission_id', 'm1')
    expect(plans).toHaveLength(1)
  })
})

describe('plansRepo — offline behavior', () => {
  const planM1 = { id: 'p1', mission_id: 'm1', kind: 'exterieur', image_url: null, calibration: null }
  const planM2 = { id: 'p2', mission_id: 'm2', kind: 'exterieur', image_url: null, calibration: null }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const db = await getDB()
    await db.clear('plan')
  })

  it('falls back to the local cache, scoped to the given mission, when offline (after having cached it once online)', async () => {
    const { from } = createSupabaseChainMock({ data: [planM1], error: null })
    vi.mocked(supabase).from = from
    await listPlansForMission('m1') // primes the cache while "online"

    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const offlineFrom = vi.fn()
    vi.mocked(supabase).from = offlineFrom

    const plans = await listPlansForMission('m1')

    expect(offlineFrom).not.toHaveBeenCalled()
    expect(plans).toHaveLength(1)
    expect(plans[0].id).toBe('p1')
  })

  it('falls back to the local cache when the online fetch throws a network error (not a Supabase error)', async () => {
    const { from } = createSupabaseChainMock({ data: [planM1], error: null })
    vi.mocked(supabase).from = from
    await listPlansForMission('m1') // primes the cache while "online"

    vi.mocked(supabase).from = vi.fn(() => {
      throw new TypeError('Failed to fetch')
    })

    const plans = await listPlansForMission('m1')
    expect(plans).toHaveLength(1)
    expect(plans[0].id).toBe('p1')
  })

  // Mandatory cross-mission isolation test: guards against a regression to a
  // whole-store clear() (the gridTemplatesRepo pattern, wrong here) which
  // would silently wipe every OTHER mission's cached plans on refresh.
  it("refreshing one mission's plans does not wipe another mission's cached plans", async () => {
    // Prime m1 and m2 independently.
    vi.mocked(supabase).from = createSupabaseChainMock({ data: [planM1], error: null }).from
    await listPlansForMission('m1')
    vi.mocked(supabase).from = createSupabaseChainMock({ data: [planM2], error: null }).from
    await listPlansForMission('m2')

    // Refresh m1 again with an updated result — this exercises the
    // delete-then-reinsert cursor scoped to m1.
    const updatedPlanM1 = { ...planM1, calibration: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } }
    vi.mocked(supabase).from = createSupabaseChainMock({ data: [updatedPlanM1], error: null }).from
    await listPlansForMission('m1')

    const db = await getDB()
    const all = await db.getAll('plan')
    expect(all).toHaveLength(2)
    const cachedM1 = all.find((p) => p.id === 'p1')
    const cachedM2 = all.find((p) => p.id === 'p2')
    expect(cachedM1?.calibration).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
    expect(cachedM2).toBeDefined()
    expect(cachedM2?.missionId).toBe('m2')
    expect(cachedM2?.id).toBe('p2')
  })

  it('drops a stale cached plan no longer present in a refreshed mission list', async () => {
    const stalePlan = { ...planM1, id: 'p-stale' }
    vi.mocked(supabase).from = createSupabaseChainMock({ data: [planM1, stalePlan], error: null }).from
    await listPlansForMission('m1')

    // Refresh returns only planM1 now — p-stale should be gone afterward.
    vi.mocked(supabase).from = createSupabaseChainMock({ data: [planM1], error: null }).from
    const plans = await listPlansForMission('m1')

    expect(plans.map((p) => p.id)).toEqual(['p1'])
    const db = await getDB()
    const cached = await db.getAllFromIndex('plan', 'mission_id', 'm1')
    expect(cached.map((p: { id: string }) => p.id)).toEqual(['p1'])
  })

  it('throws a descriptive French error and does NOT touch the cache when the Supabase query itself errors while online', async () => {
    const { from } = createSupabaseChainMock({ data: [planM1], error: null })
    vi.mocked(supabase).from = from
    await listPlansForMission('m1') // primes the cache

    const failing = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = failing.from

    await expect(listPlansForMission('m1')).rejects.toThrow('Impossible de charger les plans : network down')

    const db = await getDB()
    const cached = await db.getAllFromIndex('plan', 'mission_id', 'm1')
    expect(cached).toHaveLength(1)
    expect(cached[0].id).toBe('p1')
  })

  it('skips the network call entirely and reads straight from cache when already offline', async () => {
    const db = await getDB()
    await db.put('plan', { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null })

    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const offlineFrom = vi.fn()
    vi.mocked(supabase).from = offlineFrom

    const plans = await listPlansForMission('m1')

    expect(offlineFrom).not.toHaveBeenCalled()
    expect(plans).toHaveLength(1)
    expect(plans[0].id).toBe('p1')
  })
})
