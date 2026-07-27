// src/offline/cacheThrough.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { cachedList, cachedWrite } from './cacheThrough'
import { getDB } from './db'
import { listPendingMutations } from './pendingMutations'
import { SupabaseQueryError } from './supabaseQueryError'
import * as connectivity from './connectivity'

vi.mock('./connectivity')

interface Widget { id: string; planId: string; label: string }

describe('cachedList', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('felt_point')
  })

  it('fetches from Supabase when online, and refreshes the local cache with the result', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const widgets: Widget[] = [{ id: 'w1', planId: 'p1', label: 'a' }]
    const fetcher = vi.fn().mockResolvedValue(widgets)

    const result = await cachedList('felt_point', 'p1', fetcher)

    expect(result).toEqual(widgets)
    const db = await getDB()
    expect(await db.getAll('felt_point')).toEqual(widgets)
  })

  it('falls back to the local cache when the online fetch throws', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const db = await getDB()
    await db.put('felt_point', { id: 'w1', planId: 'p1', label: 'cached' })
    const fetcher = vi.fn().mockRejectedValue(new Error('network down'))

    const result = await cachedList<Widget>('felt_point', 'p1', fetcher)

    expect(result).toEqual([{ id: 'w1', planId: 'p1', label: 'cached' }])
  })

  it('reads straight from the local cache when already known to be offline, without calling the fetcher', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const db = await getDB()
    await db.put('felt_point', { id: 'w1', planId: 'p1', label: 'cached' })
    const fetcher = vi.fn()

    const result = await cachedList<Widget>('felt_point', 'p1', fetcher)

    expect(result).toEqual([{ id: 'w1', planId: 'p1', label: 'cached' }])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('scopes cached reads to the given plan_id, not returning other plans\' cached data', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const db = await getDB()
    await db.put('felt_point', { id: 'w1', planId: 'p1', label: 'mine' })
    await db.put('felt_point', { id: 'w2', planId: 'p2', label: 'other plan' })

    const result = await cachedList<Widget>('felt_point', 'p1', vi.fn())

    expect(result).toEqual([{ id: 'w1', planId: 'p1', label: 'mine' }])
  })

  it('propagates a SupabaseQueryError (a real business error) instead of falling back to the cache', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const db = await getDB()
    await db.put('felt_point', { id: 'w1', planId: 'p1', label: 'cached' })
    const fetcher = vi.fn().mockRejectedValue(new SupabaseQueryError('Impossible de charger : RLS violation'))

    await expect(cachedList<Widget>('felt_point', 'p1', fetcher)).rejects.toThrow(SupabaseQueryError)
  })

  it('propagates the error (instead of returning stale cached data) when the online fetch succeeds but the local cache-mirror write fails', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const db = await getDB()
    await db.put('felt_point', { id: 'w1', planId: 'p1', label: 'stale' })
    const fresh: Widget[] = [{ id: 'w2', planId: 'p1', label: 'fresh from server' }]
    const fetcher = vi.fn().mockResolvedValue(fresh)
    const transactionSpy = vi.spyOn(db, 'transaction').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    try {
      await expect(cachedList<Widget>('felt_point', 'p1', fetcher)).rejects.toThrow('quota exceeded')
      expect(fetcher).toHaveBeenCalledTimes(1)
    } finally {
      transactionSpy.mockRestore()
    }

    // the stale cached item is still there — the fresh data was never
    // written because the mirror write failed and the error propagated
    // instead of being silently swallowed
    expect(await db.get('felt_point', 'w1')).toEqual({ id: 'w1', planId: 'p1', label: 'stale' })
  })
})

describe('cachedWrite', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('felt_point')
    await db.clear('pending_mutations')
  })

  // toRow mirrors what every repo already does inline for its own Supabase
  // calls — snake_case column names. Deliberately different key names from
  // the domain object (label -> display_label) so a test bug that
  // accidentally enqueues the domain form instead of the row form is
  // impossible to miss.
  const toRow = (w: Widget) => ({ id: w.id, plan_id: w.planId, display_label: w.label })

  it('writes through to Supabase when online, and mirrors the result into the local cache', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const created: Widget = { id: 'w1', planId: 'p1', label: 'new' }
    const writer = vi.fn().mockResolvedValue(created)

    const result = await cachedWrite('felt_point', 'felt_point', 'insert', created, toRow, writer)

    expect(result).toEqual(created)
    const db = await getDB()
    expect(await db.get('felt_point', 'w1')).toEqual(created)
    expect(await listPendingMutations()).toHaveLength(0)
  })

  it('queues the mutation (in ROW form, not domain form) and applies it optimistically to the local cache when the online write fails', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const created: Widget = { id: 'w1', planId: 'p1', label: 'new' }
    const writer = vi.fn().mockRejectedValue(new Error('network down'))

    const result = await cachedWrite('felt_point', 'felt_point', 'insert', created, toRow, writer)

    expect(result).toEqual(created)
    const db = await getDB()
    expect(await db.get('felt_point', 'w1')).toEqual(created)
    const pending = await listPendingMutations()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      table: 'felt_point',
      operation: 'insert',
      payload: { id: 'w1', plan_id: 'p1', display_label: 'new' },
    })
  })

  it('queues directly without attempting Supabase when already known to be offline', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const created: Widget = { id: 'w1', planId: 'p1', label: 'new' }
    const writer = vi.fn()

    await cachedWrite('felt_point', 'felt_point', 'insert', created, toRow, writer)

    expect(writer).not.toHaveBeenCalled()
    expect(await listPendingMutations()).toHaveLength(1)
  })

  it('propagates a SupabaseQueryError (a real business error) instead of queueing it as an offline write', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const created: Widget = { id: 'w1', planId: 'p1', label: 'new' }
    const writer = vi.fn().mockRejectedValue(new SupabaseQueryError('contrainte violée'))

    await expect(cachedWrite('felt_point', 'felt_point', 'insert', created, toRow, writer)).rejects.toThrow(SupabaseQueryError)
    const db = await getDB()
    expect(await db.get('felt_point', 'w1')).toBeUndefined()
    expect(await listPendingMutations()).toHaveLength(0)
  })

  it('propagates the error, without queuing a duplicate pending mutation, when the online write succeeds but the local cache-mirror write fails', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const created: Widget = { id: 'w1', planId: 'p1', label: 'new' }
    const writer = vi.fn().mockResolvedValue(created)
    const db = await getDB()
    const putSpy = vi.spyOn(db, 'put').mockRejectedValue(new Error('quota exceeded'))

    try {
      await expect(cachedWrite('felt_point', 'felt_point', 'insert', created, toRow, writer)).rejects.toThrow(
        'quota exceeded'
      )
    } finally {
      putSpy.mockRestore()
    }

    expect(writer).toHaveBeenCalledTimes(1)
    // the real Supabase write already succeeded — a local mirror hiccup must
    // NOT be reinterpreted as "offline" and queue a duplicate mutation that
    // would later hit a primary-key conflict on replay
    expect(await listPendingMutations()).toHaveLength(0)
  })

  describe('delete operation', () => {
    const deleteToRow = (item: { id: string }) => ({ id: item.id })

    it('deletes through to Supabase when online, and removes the item from the local cache without queuing a mutation', async () => {
      vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
      const db = await getDB()
      await db.put('felt_point', { id: 'w1', planId: 'p1', label: 'existing' })
      const writer = vi.fn().mockResolvedValue({ id: 'w1' })

      const result = await cachedWrite('felt_point', 'felt_point', 'delete', { id: 'w1' }, deleteToRow, writer)

      expect(result).toEqual({ id: 'w1' })
      expect(writer).toHaveBeenCalledTimes(1)
      expect(await db.get('felt_point', 'w1')).toBeUndefined()
      expect(await listPendingMutations()).toHaveLength(0)
    })

    it('queues a delete mutation and removes the item optimistically from the local cache when the online delete fails', async () => {
      vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
      const db = await getDB()
      await db.put('felt_point', { id: 'w1', planId: 'p1', label: 'existing' })
      const writer = vi.fn().mockRejectedValue(new Error('network down'))

      const result = await cachedWrite('felt_point', 'felt_point', 'delete', { id: 'w1' }, deleteToRow, writer)

      expect(result).toEqual({ id: 'w1' })
      expect(await db.get('felt_point', 'w1')).toBeUndefined()
      const pending = await listPendingMutations()
      expect(pending).toHaveLength(1)
      expect(pending[0]).toMatchObject({ table: 'felt_point', operation: 'delete', payload: { id: 'w1' } })
    })

    it('queues a delete mutation directly without attempting Supabase when already known to be offline', async () => {
      vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
      const db = await getDB()
      await db.put('felt_point', { id: 'w1', planId: 'p1', label: 'existing' })
      const writer = vi.fn()

      await cachedWrite('felt_point', 'felt_point', 'delete', { id: 'w1' }, deleteToRow, writer)

      expect(writer).not.toHaveBeenCalled()
      expect(await db.get('felt_point', 'w1')).toBeUndefined()
      expect(await listPendingMutations()).toHaveLength(1)
    })
  })
})
