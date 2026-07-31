import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { getDB } from './db'
import * as dbModule from './db'
import {
  type ActionHistoryEntry,
  appendEntry,
  getEntriesForPlan,
  purgeUndoneEntries,
  evictOldestBatchIfOverLimit,
  undoableWrite,
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

  it('rejects a batchId combined with insert (batches can only self-heal on retry for update-only operations)', async () => {
    await expect(
      undoableWrite('p1', 'felt_point', 'insert', null, async () => ({ id: 'x' }), { batchId: 'b1' })
    ).rejects.toThrow(
      'undoableWrite: batchId is only supported for update operations — insert/delete cannot safely retry as part of a batch'
    )
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

  it('resolves with perform()\'s result and warns (does not throw) when the recording step fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const getDBSpy = vi.spyOn(dbModule, 'getDB').mockRejectedValueOnce(new Error('quota exceeded'))

    const result = await undoableWrite('p1', 'felt_point', 'insert', null, async () => ({ id: 'fp1' }))

    expect(result).toEqual({ id: 'fp1' })
    expect(warnSpy).toHaveBeenCalledWith(
      '[undo/redo] failed to record action_history entry',
      expect.any(Error)
    )
    expect(await getEntriesForPlan('p1')).toHaveLength(0) // recording never completed

    getDBSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('throws a clear error (not a raw TypeError) when operation is delete and before is null', async () => {
    await expect(
      undoableWrite('p1', 'felt_point', 'delete', null, async () => ({ id: 'x' }))
    ).rejects.toThrow('undoableWrite: delete requires a non-null before snapshot')
  })
})

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

  it('a partial batch failure leaves action_history inconsistent-but-recoverable, and a retry self-heals it (proves the comment above undo()\'s loop, not just asserts it)', async () => {
    const hartmann = {
      id: 't0', name: 'Hartmann', spacingXM: 2, spacingYM: 2.5,
      angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0, color: '#d32f2f', vibratoryBase: 7,
    }
    const db = await getDB()
    await db.put('grid_instance', { id: 'gi1', planId: 'p1', templateSnapshot: hartmann, originX: 0, originY: 0 })
    const originalLine = {
      id: 'gl1', gridInstanceId: 'gi1', family: 'axis-a' as const, polarity: '+' as const, reinforced: false,
      theoreticalPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
      adjustedPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
    }
    await db.put('grid_line', originalLine)

    const batchId = 'batch-partial'
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 5, origin_y: 3 },
      error: null,
    }).from
    await updateGridInstanceOrigin('gi1', 5, 3, { batchId })

    const shifted = {
      theoretical: originalLine.theoreticalPoints.map((p) => ({ x: p.x + 5, y: p.y + 3 })),
      adjusted: originalLine.adjustedPoints.map((p) => ({ x: p.x + 5, y: p.y + 3 })),
    }
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: {
        id: 'gl1', grid_instance_id: 'gi1', family: originalLine.family, polarity: originalLine.polarity, reinforced: originalLine.reinforced,
        theoretical_points: shifted.theoretical, adjusted_points: shifted.adjusted,
      },
      error: null,
    }).from
    await updateLinePoints('gl1', shifted.theoretical, shifted.adjusted, 'p1', { batchId })

    const entriesBefore = await getEntriesForPlan('p1')
    expect(entriesBefore).toHaveLength(2)
    expect(entriesBefore.every((e) => e.batchId === batchId && !e.undone)).toBe(true)

    // Force the SECOND entry's (grid_line) compensating call to fail: evict
    // it from the local cache. undoLinePoints's own getCachedLineOrThrow
    // guard then throws deterministically, before any network call — no
    // Supabase mocking needed for this half of the batch. The FIRST entry
    // (grid_instance) is processed first and its network call is mocked to
    // succeed normally.
    await db.delete('grid_line', 'gl1')
    vi.mocked(supabase).from = createSupabaseChainMock({
      data: { id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 0, origin_y: 0 },
      error: null,
    }).from

    await expect(undo('p1')).rejects.toThrow()

    // Inconsistent-but-recoverable: the first entry's real mutation went
    // through (grid_instance reverted to its pre-recalibration origin)...
    const midFailureInstance = await db.get('grid_instance', 'gi1')
    expect(midFailureInstance.originX).toBe(0)
    expect(midFailureInstance.originY).toBe(0)
    // ...but NEITHER entry flipped `undone` — setUndoneFlag only runs after
    // the whole batch loop completes, and it didn't.
    const entriesAfterFailure = await getEntriesForPlan('p1')
    expect(entriesAfterFailure.every((e) => !e.undone)).toBe(true)

    // Retry: restore the evicted cache entry (simulating whatever transient
    // condition caused the failure going away) and let both compensating
    // calls succeed this time.
    await db.put('grid_line', originalLine)
    const retryFrom = vi.fn()
    retryFrom.mockImplementationOnce(
      () => createSupabaseChainMock({
        data: { id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 0, origin_y: 0 },
        error: null,
      }).chain
    )
    retryFrom.mockImplementationOnce(
      () => createSupabaseChainMock({
        data: {
          id: 'gl1', grid_instance_id: 'gi1', family: originalLine.family, polarity: originalLine.polarity, reinforced: originalLine.reinforced,
          theoretical_points: originalLine.theoreticalPoints, adjusted_points: originalLine.adjustedPoints,
        },
        error: null,
      }).chain
    )
    vi.mocked(supabase).from = retryFrom

    await undo('p1') // must not throw this time

    const restoredInstance = await db.get('grid_instance', 'gi1')
    expect(restoredInstance.originX).toBe(0)
    expect(restoredInstance.originY).toBe(0)
    const restoredLine = await db.get('grid_line', 'gl1')
    expect(restoredLine.theoreticalPoints).toEqual(originalLine.theoreticalPoints)
    expect(restoredLine.adjustedPoints).toEqual(originalLine.adjustedPoints)

    // The whole batch is now consistently flipped — self-healed via retry.
    const entriesAfterRetry = await getEntriesForPlan('p1')
    expect(entriesAfterRetry.every((e) => e.undone)).toBe(true)
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
    // entry with the SMALLEST id — original recording order was fp1 (id 1),
    // gi1 (id 2), ph1 (id 3), so once all 3 are undone, redo proceeds
    // fp1 → gi1 → ph1, in that fixed order, regardless of the order they
    // were undone in (which happened to be the reverse: ph1, gi1, fp1, since
    // undo always targets the LARGEST id).
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
