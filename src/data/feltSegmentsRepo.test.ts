import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createFeltSegment, deleteFeltSegment, listFeltSegmentsForPlan } from './feltSegmentsRepo'
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

describe('feltSegmentsRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a felt segment with no polarity given (defaults to null — the ArUco-detection path)', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'fs1', plan_id: 'p1', network_name: 'Hartmann',
        ax: 1, ay: 2, bx: 3, by: 4, polarity_a: null, polarity_b: null, created_at: '2026-07-20T10:00:00Z',
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const segment = await createFeltSegment({
      planId: 'p1', networkName: 'Hartmann', pointA: { x: 1, y: 2 }, pointB: { x: 3, y: 4 },
    })

    expect(from).toHaveBeenCalledWith('felt_segment')
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        plan_id: 'p1', network_name: 'Hartmann', ax: 1, ay: 2, bx: 3, by: 4,
        polarity_a: null, polarity_b: null,
      })
    )
    // id and created_at are now generated client-side, unconditionally,
    // before the network attempt (spec §4.1) — assert shape, not a fixed value.
    const insertedRow = chain.insert.mock.calls[0][0]
    expect(insertedRow.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(typeof insertedRow.created_at).toBe('string')
    expect(segment.id).toBe('fs1')
    expect(segment.pointA).toEqual({ x: 1, y: 2 })
    expect(segment.pointB).toEqual({ x: 3, y: 4 })
    expect(segment.polarityA).toBeNull()
    expect(segment.polarityB).toBeNull()
  })

  it('creates a felt segment with explicit polarity at each end (the manual network felt-point tool)', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'fs1', plan_id: 'p1', network_name: 'Hartmann',
        ax: 1, ay: 2, bx: 3, by: 4, polarity_a: '+', polarity_b: '-', created_at: '2026-07-20T10:00:00Z',
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const segment = await createFeltSegment({
      planId: 'p1', networkName: 'Hartmann', pointA: { x: 1, y: 2 }, pointB: { x: 3, y: 4 },
      polarityA: '+', polarityB: '-',
    })

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        plan_id: 'p1', network_name: 'Hartmann', ax: 1, ay: 2, bx: 3, by: 4,
        polarity_a: '+', polarity_b: '-',
      })
    )
    expect(segment.polarityA).toBe('+')
    expect(segment.polarityB).toBe('-')
  })

  it('throws a descriptive French error when creation fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(
      createFeltSegment({ planId: 'p1', networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 1, y: 1 } })
    ).rejects.toThrow("Impossible d'enregistrer le segment ressenti : network down")
  })

  it('lists felt segments scoped to a plan', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [
        { id: 'fs1', plan_id: 'p1', network_name: 'Hartmann', ax: 0, ay: 0, bx: 1, by: 1, created_at: '2026-07-20T10:00:00Z' },
      ],
      error: null,
    })
    vi.mocked(supabase).from = from

    const segments = await listFeltSegmentsForPlan('p1')

    expect(chain.eq).toHaveBeenCalledWith('plan_id', 'p1')
    expect(segments).toHaveLength(1)
    expect(segments[0].networkName).toBe('Hartmann')
  })

  it('deletes a felt segment', async () => {
    const { from, chain } = createSupabaseChainMock({ data: null, error: null })
    vi.mocked(supabase).from = from

    await deleteFeltSegment('fs1')

    expect(from).toHaveBeenCalledWith('felt_segment')
    expect(chain.eq).toHaveBeenCalledWith('id', 'fs1')
  })

  it('throws a descriptive French error when deletion fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(deleteFeltSegment('fs1')).rejects.toThrow(
      'Impossible de supprimer le segment ressenti : network down'
    )
  })
})

describe('feltSegmentsRepo — offline behavior', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('felt_segment')
    await db.clear('pending_mutations')
  })

  it('falls back to the local cache when the online fetch fails, after having cached it once online', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const { from } = createSupabaseChainMock({
      data: [{ id: 'fs1', plan_id: 'p1', network_name: 'Hartmann', ax: 0, ay: 0, bx: 1, by: 1, polarity_a: null, polarity_b: null, created_at: '2026-07-20T10:00:00Z' }],
      error: null,
    })
    vi.mocked(supabase).from = from
    await listFeltSegmentsForPlan('p1') // primes the cache while "online"

    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const segments = await listFeltSegmentsForPlan('p1')

    expect(segments).toHaveLength(1)
    expect(segments[0].networkName).toBe('Hartmann')
  })

  it('returns the optimistic segment and queues a pending mutation when creating offline', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const writerFrom = vi.fn()
    vi.mocked(supabase).from = writerFrom

    const segment = await createFeltSegment({
      planId: 'p1', networkName: 'Hartmann', pointA: { x: 1, y: 2 }, pointB: { x: 3, y: 4 }, polarityA: '+', polarityB: '-',
    })

    expect(writerFrom).not.toHaveBeenCalled()
    expect(segment.planId).toBe('p1')
    expect(segment.pointA).toEqual({ x: 1, y: 2 })
    expect(segment.pointB).toEqual({ x: 3, y: 4 })

    const pending = await listPendingMutations()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ table: 'felt_segment', operation: 'insert' })
    expect(pending[0].payload).toMatchObject({
      plan_id: 'p1', network_name: 'Hartmann', ax: 1, ay: 2, bx: 3, by: 4, polarity_a: '+', polarity_b: '-',
    })

    const db = await getDB()
    expect(await db.get('felt_segment', segment.id)).toEqual(segment)
  })
})
