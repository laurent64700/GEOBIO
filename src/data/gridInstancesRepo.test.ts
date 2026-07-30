import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createGridInstance, listGridInstancesForPlan, updateGridInstanceOrigin } from './gridInstancesRepo'
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

const hartmann = {
  id: 't0', name: 'Hartmann', spacingXM: 2, spacingYM: 2.5,
  angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0, color: '#d32f2f',
  vibratoryBase: 7,
}

describe('gridInstancesRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a grid instance with a frozen template snapshot', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: { id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 1.5, origin_y: -2 },
      error: null,
    })
    vi.mocked(supabase).from = from

    const instance = await createGridInstance({
      planId: 'p1', templateSnapshot: hartmann, originX: 1.5, originY: -2,
    })

    expect(from).toHaveBeenCalledWith('grid_instance')
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        plan_id: 'p1', template_snapshot: hartmann, origin_x: 1.5, origin_y: -2,
      })
    )
    // id is now generated client-side, unconditionally, before the network
    // attempt (spec §4.1) — assert shape, not a fixed value.
    const insertedRow = chain.insert.mock.calls[0][0]
    expect(insertedRow.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(instance.templateSnapshot).toEqual(hartmann)
  })

  it('lists grid instances scoped to a plan', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [{ id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 0, origin_y: 0 }],
      error: null,
    })
    vi.mocked(supabase).from = from

    const instances = await listGridInstancesForPlan('p1')

    expect(chain.eq).toHaveBeenCalledWith('plan_id', 'p1')
    expect(instances).toHaveLength(1)
  })

  it("updates a grid instance's origin (grid recalibration)", async () => {
    const db = await getDB()
    await db.put('grid_instance', {
      id: 'gi1', planId: 'p1', templateSnapshot: hartmann, originX: 0, originY: 0,
    })

    const { from, chain } = createSupabaseChainMock({
      data: { id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 3.2, origin_y: -0.7 },
      error: null,
    })
    vi.mocked(supabase).from = from

    const instance = await updateGridInstanceOrigin('gi1', 3.2, -0.7)

    expect(chain.eq).toHaveBeenCalledWith('id', 'gi1')
    expect(chain.update).toHaveBeenCalledWith({ origin_x: 3.2, origin_y: -0.7 })
    expect(instance.originX).toBe(3.2)
    expect(instance.originY).toBe(-0.7)
  })

  it('throws a descriptive French error when creation fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(
      createGridInstance({ planId: 'p1', templateSnapshot: hartmann, originX: 0, originY: 0 })
    ).rejects.toThrow("Impossible de créer l'instance de grille : network down")
  })

  it('throws a descriptive French error when listing fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(listGridInstancesForPlan('p1')).rejects.toThrow(
      'Impossible de charger les instances de grille : network down'
    )
  })

  it('throws a descriptive French error when the origin update fails', async () => {
    const db = await getDB()
    await db.put('grid_instance', {
      id: 'gi1', planId: 'p1', templateSnapshot: hartmann, originX: 0, originY: 0,
    })
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(updateGridInstanceOrigin('gi1', 3.2, -0.7)).rejects.toThrow(
      'Impossible de recaler la grille : network down'
    )
  })
})

describe('gridInstancesRepo — offline behavior', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('grid_instance')
    await db.clear('pending_mutations')
  })

  it('falls back to the local cache when the online fetch fails, after having cached it once online', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const { from } = createSupabaseChainMock({
      data: [{ id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 0, origin_y: 0 }],
      error: null,
    })
    vi.mocked(supabase).from = from
    await listGridInstancesForPlan('p1') // primes the cache while "online"

    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const instances = await listGridInstancesForPlan('p1')

    expect(instances).toHaveLength(1)
    expect(instances[0].templateSnapshot).toEqual(hartmann)
  })

  it('returns the optimistic instance and queues a pending mutation when creating offline', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const writerFrom = vi.fn()
    vi.mocked(supabase).from = writerFrom

    const instance = await createGridInstance({
      planId: 'p1', templateSnapshot: hartmann, originX: 1.5, originY: -2,
    })

    expect(writerFrom).not.toHaveBeenCalled()
    expect(instance.planId).toBe('p1')
    expect(instance.templateSnapshot).toEqual(hartmann)

    const pending = await listPendingMutations()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ table: 'grid_instance', operation: 'insert' })
    expect(pending[0].payload).toMatchObject({
      plan_id: 'p1', template_snapshot: hartmann, origin_x: 1.5, origin_y: -2,
    })

    const db = await getDB()
    expect(await db.get('grid_instance', instance.id)).toEqual(instance)
  })

  it('preserves the templateSnapshot when recalibrating the origin offline, and queues the full row', async () => {
    const db = await getDB()
    const original = {
      id: 'gi1', planId: 'p1', templateSnapshot: hartmann, originX: 0, originY: 0,
    }
    await db.put('grid_instance', original)

    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const writerFrom = vi.fn()
    vi.mocked(supabase).from = writerFrom

    const instance = await updateGridInstanceOrigin('gi1', 3.2, -0.7)

    expect(writerFrom).not.toHaveBeenCalled()
    expect(instance.originX).toBe(3.2)
    expect(instance.originY).toBe(-0.7)
    expect(instance.templateSnapshot).toEqual(hartmann)

    // (a) the cached record now has the new origin coordinates
    // (b) the cached record still has its original templateSnapshot
    const cached = await db.get('grid_instance', 'gi1')
    expect(cached.originX).toBe(3.2)
    expect(cached.originY).toBe(-0.7)
    expect(cached.templateSnapshot).toEqual(hartmann)

    // (c) the queued mutation payload is in ROW form and is the full updated
    // row, not just a delta — template_snapshot must be present.
    const pending = await listPendingMutations()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ table: 'grid_instance', operation: 'update' })
    expect(pending[0].payload).toEqual({
      id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 3.2, origin_y: -0.7,
    })
  })

  it('throws a clear error when recalibrating an instance that is not in the local cache', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const writerFrom = vi.fn()
    vi.mocked(supabase).from = writerFrom

    await expect(updateGridInstanceOrigin('missing-id', 1, 1)).rejects.toThrow()
    expect(writerFrom).not.toHaveBeenCalled()
  })
})

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
