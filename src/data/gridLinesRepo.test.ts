import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createGridLines, listGridLinesForInstance, updateAdjustedPoints, updateLinePoints } from './gridLinesRepo'
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

describe('gridLinesRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('bulk-creates grid lines with adjustedPoints initialized to theoreticalPoints', async () => {
    const rows = [
      {
        id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: true,
        theoretical_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
        adjusted_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
      },
    ]
    const { from, chain } = createSupabaseChainMock({ data: rows, error: null })
    vi.mocked(supabase).from = from

    const lines = await createGridLines([
      { gridInstanceId: 'gi1', family: 'axis-a', polarity: '+', reinforced: true, theoreticalPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }] },
    ])

    expect(from).toHaveBeenCalledWith('grid_line')
    const insertedRows = chain.insert.mock.calls[0][0]
    expect(insertedRows).toHaveLength(1)
    // id is now generated client-side, unconditionally, before the network
    // attempt (spec §4.1) — assert shape, not absence.
    expect(insertedRows[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(insertedRows[0]).toMatchObject({
      grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: true,
      theoretical_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
      adjusted_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
    })
    expect(lines[0].adjustedPoints).toEqual(lines[0].theoreticalPoints)
  })

  it('lists grid lines scoped to a grid instance', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [
        {
          id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: true,
          theoretical_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
          adjusted_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
        },
      ],
      error: null,
    })
    vi.mocked(supabase).from = from

    const lines = await listGridLinesForInstance('gi1')

    expect(chain.eq).toHaveBeenCalledWith('grid_instance_id', 'gi1')
    expect(lines).toHaveLength(1)
  })

  it('updates a single line\'s adjusted points', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: false,
        theoretical_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
        adjusted_points: [{ x: 0.3, y: -3 }, { x: 0, y: 3 }],
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const line = await updateAdjustedPoints('gl1', [{ x: 0.3, y: -3 }, { x: 0, y: 3 }])

    expect(chain.eq).toHaveBeenCalledWith('id', 'gl1')
    expect(chain.update).toHaveBeenCalledWith({ adjusted_points: [{ x: 0.3, y: -3 }, { x: 0, y: 3 }] })
    expect(line.adjustedPoints).toEqual([{ x: 0.3, y: -3 }, { x: 0, y: 3 }])
  })

  it('updates both theoretical and adjusted points of a line (grid recalibration)', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: false,
        theoretical_points: [{ x: 2, y: -1 }, { x: 2, y: 5 }],
        adjusted_points: [{ x: 2.4, y: -1 }, { x: 2, y: 5 }],
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const line = await updateLinePoints(
      'gl1',
      [{ x: 2, y: -1 }, { x: 2, y: 5 }],
      [{ x: 2.4, y: -1 }, { x: 2, y: 5 }]
    )

    expect(chain.eq).toHaveBeenCalledWith('id', 'gl1')
    expect(chain.update).toHaveBeenCalledWith({
      theoretical_points: [{ x: 2, y: -1 }, { x: 2, y: 5 }],
      adjusted_points: [{ x: 2.4, y: -1 }, { x: 2, y: 5 }],
    })
    expect(line.theoreticalPoints).toEqual([{ x: 2, y: -1 }, { x: 2, y: 5 }])
    expect(line.adjustedPoints).toEqual([{ x: 2.4, y: -1 }, { x: 2, y: 5 }])
  })

  it('throws a descriptive French error when listing fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(listGridLinesForInstance('gi1')).rejects.toThrow(
      'Impossible de charger les lignes de grille : network down'
    )
  })

  it('throws a descriptive French error when updating adjusted points fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(updateAdjustedPoints('gl1', [{ x: 0, y: 0 }])).rejects.toThrow(
      'Impossible de mettre à jour la ligne : network down'
    )
  })
})

describe('gridLinesRepo — offline behavior', () => {
  const lineGi1 = {
    id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: true,
    theoretical_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
    adjusted_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
  }
  const lineGi2 = {
    id: 'gl2', grid_instance_id: 'gi2', family: 'axis-b', polarity: '-', reinforced: false,
    theoretical_points: [{ x: 1, y: 0 }, { x: 5, y: 0 }],
    adjusted_points: [{ x: 1, y: 0 }, { x: 5, y: 0 }],
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const db = await getDB()
    await db.clear('grid_line')
    await db.clear('pending_mutations')
  })

  it('falls back to the local cache, scoped to the given instance, when offline (after having cached it once online)', async () => {
    const { from } = createSupabaseChainMock({ data: [lineGi1], error: null })
    vi.mocked(supabase).from = from
    await listGridLinesForInstance('gi1') // primes the cache while "online"

    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const offlineFrom = vi.fn()
    vi.mocked(supabase).from = offlineFrom

    const lines = await listGridLinesForInstance('gi1')

    expect(offlineFrom).not.toHaveBeenCalled()
    expect(lines).toHaveLength(1)
    expect(lines[0].id).toBe('gl1')
  })

  it('falls back to the local cache when the online fetch throws a network error (not a Supabase error)', async () => {
    const { from } = createSupabaseChainMock({ data: [lineGi1], error: null })
    vi.mocked(supabase).from = from
    await listGridLinesForInstance('gi1') // primes the cache while "online"

    vi.mocked(supabase).from = vi.fn(() => {
      throw new TypeError('Failed to fetch')
    })

    const lines = await listGridLinesForInstance('gi1')
    expect(lines).toHaveLength(1)
    expect(lines[0].id).toBe('gl1')
  })

  it('refreshing one grid instance does not wipe another instance\'s cached lines', async () => {
    // Prime gi1 and gi2 independently.
    vi.mocked(supabase).from = createSupabaseChainMock({ data: [lineGi1], error: null }).from
    await listGridLinesForInstance('gi1')
    vi.mocked(supabase).from = createSupabaseChainMock({ data: [lineGi2], error: null }).from
    await listGridLinesForInstance('gi2')

    // Refresh gi1 again with an updated (still single-line) result — this
    // exercises the delete-then-reinsert cursor scoped to gi1.
    const updatedLineGi1 = { ...lineGi1, adjusted_points: [{ x: 0.5, y: -3 }, { x: 0, y: 3 }] }
    vi.mocked(supabase).from = createSupabaseChainMock({ data: [updatedLineGi1], error: null }).from
    await listGridLinesForInstance('gi1')

    const db = await getDB()
    const all = await db.getAll('grid_line')
    expect(all).toHaveLength(2)
    const cachedGi1 = all.find((l) => l.id === 'gl1')
    const cachedGi2 = all.find((l) => l.id === 'gl2')
    expect(cachedGi1?.adjustedPoints).toEqual([{ x: 0.5, y: -3 }, { x: 0, y: 3 }])
    expect(cachedGi2).toBeDefined()
    expect(cachedGi2?.gridInstanceId).toBe('gi2')
  })

  it('drops a stale cached line no longer present in a refreshed instance list', async () => {
    const staleLine = { ...lineGi1, id: 'gl-stale' }
    vi.mocked(supabase).from = createSupabaseChainMock({ data: [lineGi1, staleLine], error: null }).from
    await listGridLinesForInstance('gi1')

    // Refresh returns only lineGi1 now — gl-stale should be gone afterward.
    vi.mocked(supabase).from = createSupabaseChainMock({ data: [lineGi1], error: null }).from
    const lines = await listGridLinesForInstance('gi1')

    expect(lines.map((l) => l.id)).toEqual(['gl1'])
    const db = await getDB()
    const cached = await db.getAllFromIndex('grid_line', 'grid_instance_id', 'gi1')
    expect(cached.map((l) => l.id)).toEqual(['gl1'])
  })

  it('mirrors the full server row into the cache on a successful online updateAdjustedPoints', async () => {
    const db = await getDB()
    await db.put('grid_line', {
      id: 'gl1', gridInstanceId: 'gi1', family: 'axis-a', polarity: '+', reinforced: true,
      theoreticalPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
      adjustedPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
    })

    const serverRow = {
      id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: true,
      theoretical_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
      adjusted_points: [{ x: 0.7, y: -3 }, { x: 0, y: 3 }],
    }
    vi.mocked(supabase).from = createSupabaseChainMock({ data: serverRow, error: null }).from

    const line = await updateAdjustedPoints('gl1', [{ x: 0.7, y: -3 }, { x: 0, y: 3 }])
    expect(line.adjustedPoints).toEqual([{ x: 0.7, y: -3 }, { x: 0, y: 3 }])

    const cached = await db.get('grid_line', 'gl1')
    expect(cached.adjustedPoints).toEqual([{ x: 0.7, y: -3 }, { x: 0, y: 3 }])
    expect(cached.theoreticalPoints).toEqual([{ x: 0, y: -3 }, { x: 0, y: 3 }])
  })

  it('mirrors the full server row into the cache on a successful online updateLinePoints', async () => {
    const db = await getDB()
    await db.put('grid_line', {
      id: 'gl1', gridInstanceId: 'gi1', family: 'axis-a', polarity: '+', reinforced: true,
      theoreticalPoints: [{ x: 2, y: -1 }, { x: 2, y: 5 }],
      adjustedPoints: [{ x: 2, y: -1 }, { x: 2, y: 5 }],
    })

    const serverRow = {
      id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: true,
      theoretical_points: [{ x: 3, y: -1 }, { x: 3, y: 5 }],
      adjusted_points: [{ x: 3.4, y: -1 }, { x: 3, y: 5 }],
    }
    vi.mocked(supabase).from = createSupabaseChainMock({ data: serverRow, error: null }).from

    const line = await updateLinePoints(
      'gl1',
      [{ x: 3, y: -1 }, { x: 3, y: 5 }],
      [{ x: 3.4, y: -1 }, { x: 3, y: 5 }]
    )

    const cached = await db.get('grid_line', 'gl1')
    expect(cached.theoreticalPoints).toEqual([{ x: 3, y: -1 }, { x: 3, y: 5 }])
    expect(cached.adjustedPoints).toEqual([{ x: 3.4, y: -1 }, { x: 3, y: 5 }])
    expect(line).toEqual(cached)
  })

  it('applies just the adjustedPoints patch and queues a row-form mutation when updateAdjustedPoints runs offline', async () => {
    const db = await getDB()
    const original = {
      id: 'gl1', gridInstanceId: 'gi1', family: 'axis-a', polarity: '+', reinforced: true,
      theoreticalPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
      adjustedPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
    }
    await db.put('grid_line', original)

    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const writerFrom = vi.fn()
    vi.mocked(supabase).from = writerFrom

    const line = await updateAdjustedPoints('gl1', [{ x: 0.3, y: -3 }, { x: 0, y: 3 }])

    expect(writerFrom).not.toHaveBeenCalled()
    expect(line.adjustedPoints).toEqual([{ x: 0.3, y: -3 }, { x: 0, y: 3 }])
    // theoreticalPoints (and other fields) must survive untouched.
    expect(line.theoreticalPoints).toEqual([{ x: 0, y: -3 }, { x: 0, y: 3 }])
    expect(line.reinforced).toBe(true)

    const cached = await db.get('grid_line', 'gl1')
    expect(cached.adjustedPoints).toEqual([{ x: 0.3, y: -3 }, { x: 0, y: 3 }])
    expect(cached.theoreticalPoints).toEqual([{ x: 0, y: -3 }, { x: 0, y: 3 }])

    const pending = await listPendingMutations()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ table: 'grid_line', operation: 'update' })
    expect(pending[0].payload).toEqual({ id: 'gl1', adjusted_points: [{ x: 0.3, y: -3 }, { x: 0, y: 3 }] })
  })

  it('applies just the points patch and queues a row-form mutation when updateLinePoints runs offline', async () => {
    const db = await getDB()
    const original = {
      id: 'gl1', gridInstanceId: 'gi1', family: 'axis-a', polarity: '+', reinforced: true,
      theoreticalPoints: [{ x: 2, y: -1 }, { x: 2, y: 5 }],
      adjustedPoints: [{ x: 2, y: -1 }, { x: 2, y: 5 }],
    }
    await db.put('grid_line', original)

    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const writerFrom = vi.fn()
    vi.mocked(supabase).from = writerFrom

    const line = await updateLinePoints(
      'gl1',
      [{ x: 3, y: -1 }, { x: 3, y: 5 }],
      [{ x: 3.4, y: -1 }, { x: 3, y: 5 }]
    )

    expect(writerFrom).not.toHaveBeenCalled()
    expect(line.theoreticalPoints).toEqual([{ x: 3, y: -1 }, { x: 3, y: 5 }])
    expect(line.adjustedPoints).toEqual([{ x: 3.4, y: -1 }, { x: 3, y: 5 }])
    expect(line.reinforced).toBe(true)

    const cached = await db.get('grid_line', 'gl1')
    expect(cached.theoreticalPoints).toEqual([{ x: 3, y: -1 }, { x: 3, y: 5 }])
    expect(cached.adjustedPoints).toEqual([{ x: 3.4, y: -1 }, { x: 3, y: 5 }])

    const pending = await listPendingMutations()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ table: 'grid_line', operation: 'update' })
    expect(pending[0].payload).toEqual({
      id: 'gl1',
      theoretical_points: [{ x: 3, y: -1 }, { x: 3, y: 5 }],
      adjusted_points: [{ x: 3.4, y: -1 }, { x: 3, y: 5 }],
    })
  })

  it('creates grid lines online: mirrors all N returned lines into the cache with zero pending mutations', async () => {
    const rows = [
      { id: 'gl-a', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: true,
        theoretical_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }], adjusted_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }] },
      { id: 'gl-b', grid_instance_id: 'gi1', family: 'axis-a', polarity: '-', reinforced: false,
        theoretical_points: [{ x: 1, y: -3 }, { x: 1, y: 3 }], adjusted_points: [{ x: 1, y: -3 }, { x: 1, y: 3 }] },
      { id: 'gl-c', grid_instance_id: 'gi1', family: 'axis-b', polarity: '+', reinforced: true,
        theoretical_points: [{ x: 2, y: -3 }, { x: 2, y: 3 }], adjusted_points: [{ x: 2, y: -3 }, { x: 2, y: 3 }] },
    ]
    vi.mocked(supabase).from = createSupabaseChainMock({ data: rows, error: null }).from

    const lines = await createGridLines([
      { gridInstanceId: 'gi1', family: 'axis-a', polarity: '+', reinforced: true, theoreticalPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }] },
      { gridInstanceId: 'gi1', family: 'axis-a', polarity: '-', reinforced: false, theoreticalPoints: [{ x: 1, y: -3 }, { x: 1, y: 3 }] },
      { gridInstanceId: 'gi1', family: 'axis-b', polarity: '+', reinforced: true, theoreticalPoints: [{ x: 2, y: -3 }, { x: 2, y: 3 }] },
    ])

    expect(lines).toHaveLength(3)
    const db = await getDB()
    for (const row of rows) {
      const cached = await db.get('grid_line', row.id)
      expect(cached).toBeDefined()
      expect(cached.gridInstanceId).toBe('gi1')
    }
    const pending = await listPendingMutations()
    expect(pending).toHaveLength(0)
  })

  it('creates grid lines offline: caches all N lines with distinct client-generated ids and queues exactly ONE batched mutation', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const writerFrom = vi.fn()
    vi.mocked(supabase).from = writerFrom

    const inputs = [
      { gridInstanceId: 'gi1', family: 'axis-a' as const, polarity: '+' as const, reinforced: true, theoreticalPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }] },
      { gridInstanceId: 'gi1', family: 'axis-a' as const, polarity: '-' as const, reinforced: false, theoreticalPoints: [{ x: 1, y: -3 }, { x: 1, y: 3 }] },
      { gridInstanceId: 'gi1', family: 'axis-b' as const, polarity: '+' as const, reinforced: true, theoreticalPoints: [{ x: 2, y: -3 }, { x: 2, y: 3 }] },
    ]

    const lines = await createGridLines(inputs)

    expect(writerFrom).not.toHaveBeenCalled()
    expect(lines).toHaveLength(3)
    const ids = lines.map((l) => l.id)
    expect(new Set(ids).size).toBe(3)
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    }

    const db = await getDB()
    for (const line of lines) {
      expect(await db.get('grid_line', line.id)).toEqual(line)
    }

    const pending = await listPendingMutations()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ table: 'grid_line', operation: 'insert' })
    expect(Array.isArray(pending[0].payload)).toBe(true)
    const payloadRows = pending[0].payload as Array<{ id: string; grid_instance_id: string }>
    expect(payloadRows).toHaveLength(3)
    for (const row of payloadRows) {
      expect(typeof row.id).toBe('string')
      expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    }
    expect(new Set(payloadRows.map((r) => r.id)).size).toBe(3)
  })

  it('throws a clear error when updating a line that is not in the local cache while offline', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const writerFrom = vi.fn()
    vi.mocked(supabase).from = writerFrom

    await expect(updateAdjustedPoints('missing-id', [{ x: 0, y: 0 }])).rejects.toThrow()
    expect(writerFrom).not.toHaveBeenCalled()
  })

  it('merges sequential offline updates (adjustedPoints then theoretical+adjusted) without clobbering each other', async () => {
    const db = await getDB()
    const original = {
      id: 'gl1', gridInstanceId: 'gi1', family: 'axis-a', polarity: '+', reinforced: false,
      theoreticalPoints: [{ x: 0, y: 0 }, { x: 0, y: 10 }],
      adjustedPoints: [{ x: 0, y: 0 }, { x: 0, y: 10 }],
    }
    await db.put('grid_line', original)

    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    vi.mocked(supabase).from = vi.fn()

    // First: a felt-adjustment drag touches only adjustedPoints.
    await updateAdjustedPoints('gl1', [{ x: 0.5, y: 0 }, { x: 0, y: 10 }])
    // Then: a grid recalibration shifts both arrays.
    await updateLinePoints(
      'gl1',
      [{ x: 1, y: 0 }, { x: 1, y: 10 }],
      [{ x: 1.5, y: 0 }, { x: 1, y: 10 }]
    )

    const final = await db.get('grid_line', 'gl1')
    expect(final.theoreticalPoints).toEqual([{ x: 1, y: 0 }, { x: 1, y: 10 }])
    expect(final.adjustedPoints).toEqual([{ x: 1.5, y: 0 }, { x: 1, y: 10 }])
    expect(final.reinforced).toBe(false)
    expect(final.family).toBe('axis-a')

    const pending = await listPendingMutations()
    expect(pending).toHaveLength(2)
    expect(pending[0].payload).toEqual({ id: 'gl1', adjusted_points: [{ x: 0.5, y: 0 }, { x: 0, y: 10 }] })
    expect(pending[1].payload).toEqual({
      id: 'gl1',
      theoretical_points: [{ x: 1, y: 0 }, { x: 1, y: 10 }],
      adjusted_points: [{ x: 1.5, y: 0 }, { x: 1, y: 10 }],
    })
  })
})
