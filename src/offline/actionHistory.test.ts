import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDB } from './db'
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
})
