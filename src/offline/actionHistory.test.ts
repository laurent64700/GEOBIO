import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDB } from './db'
import {
  type ActionHistoryEntry,
  appendEntry,
  getEntriesForPlan,
  purgeUndoneEntries,
  evictOldestBatchIfOverLimit,
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
