// src/offline/sync.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { flushPendingMutations } from './sync'
import { enqueueMutation, listPendingMutations } from './pendingMutations'
import { getDB } from './db'
import { supabase } from '../lib/supabaseClient'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('flushPendingMutations', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('pending_mutations')
    vi.clearAllMocks()
  })

  it('replays queued mutations in strict FIFO (enqueue) order', async () => {
    await enqueueMutation({ table: 'felt_point', operation: 'insert', payload: { id: 'fp1' } })
    await enqueueMutation({ table: 'felt_segment', operation: 'insert', payload: { id: 'fs1' } })
    await enqueueMutation({ table: 'phenomenon', operation: 'insert', payload: { id: 'ph1' } })

    const callOrder: string[] = []
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      callOrder.push(table)
      return { insert: vi.fn(() => Promise.resolve({ error: null })) } as any
    })

    await flushPendingMutations()

    expect(callOrder).toEqual(['felt_point', 'felt_segment', 'phenomenon'])
  })

  it('removes a successfully replayed mutation from the queue', async () => {
    await enqueueMutation({ table: 'felt_point', operation: 'insert', payload: { id: 'fp1' } })
    vi.mocked(supabase.from).mockReturnValue({
      insert: vi.fn(() => Promise.resolve({ error: null })),
    } as any)

    await flushPendingMutations()

    expect(await listPendingMutations()).toHaveLength(0)
  })

  it('increments attempts on a failing mutation and keeps it queued, without blocking the next one', async () => {
    await enqueueMutation({ table: 'felt_point', operation: 'insert', payload: { id: 'fp1' } })
    await enqueueMutation({ table: 'felt_point', operation: 'insert', payload: { id: 'fp2' } })

    let call = 0
    vi.mocked(supabase.from).mockImplementation(() => ({
      insert: vi.fn(() => {
        call += 1
        return call === 1
          ? Promise.resolve({ error: { message: 'boom' } })
          : Promise.resolve({ error: null })
      }),
    } as any))

    await flushPendingMutations()

    const remaining = await listPendingMutations()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].payload).toEqual({ id: 'fp1' })
    expect(remaining[0].attempts).toBe(1)
  })

  it('increments attempts (and continues) when the Supabase call itself throws/rejects', async () => {
    await enqueueMutation({ table: 'felt_point', operation: 'insert', payload: { id: 'fp1' } })
    await enqueueMutation({ table: 'felt_point', operation: 'insert', payload: { id: 'fp2' } })

    let call = 0
    vi.mocked(supabase.from).mockImplementation(() => ({
      insert: vi.fn(() => {
        call += 1
        if (call === 1) return Promise.reject(new Error('network down'))
        return Promise.resolve({ error: null })
      }),
    } as any))

    await flushPendingMutations()

    const remaining = await listPendingMutations()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].payload).toEqual({ id: 'fp1' })
    expect(remaining[0].attempts).toBe(1)
  })

  it('passes an array payload straight through to insert() for a bulk grid_line mutation (no looping/splitting)', async () => {
    const rows = [{ id: 'gl1', x: 1 }, { id: 'gl2', x: 2 }]
    await enqueueMutation({ table: 'grid_line', operation: 'insert', payload: rows })

    const insertMock = vi.fn(() => Promise.resolve({ error: null }))
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as any)

    await flushPendingMutations()

    expect(supabase.from).toHaveBeenCalledWith('grid_line')
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertMock).toHaveBeenCalledWith(rows)
  })

  it('splits an update payload into patch + id, calling .update(patch).eq("id", id)', async () => {
    await enqueueMutation({
      table: 'felt_point',
      operation: 'update',
      payload: { id: 'fp1', note: 'updated', vibratory_intensity: 3 },
    })

    const eqMock = vi.fn(() => Promise.resolve({ error: null }))
    const updateMock = vi.fn(() => ({ eq: eqMock }))
    vi.mocked(supabase.from).mockReturnValue({ update: updateMock } as any)

    await flushPendingMutations()

    expect(supabase.from).toHaveBeenCalledWith('felt_point')
    expect(updateMock).toHaveBeenCalledWith({ note: 'updated', vibratory_intensity: 3 })
    expect(eqMock).toHaveBeenCalledWith('id', 'fp1')
  })

  it('calls .delete().eq("id", id) for a delete mutation', async () => {
    await enqueueMutation({ table: 'felt_point', operation: 'delete', payload: { id: 'fp1' } })

    const eqMock = vi.fn(() => Promise.resolve({ error: null }))
    const deleteMock = vi.fn(() => ({ eq: eqMock }))
    vi.mocked(supabase.from).mockReturnValue({ delete: deleteMock } as any)

    await flushPendingMutations()

    expect(supabase.from).toHaveBeenCalledWith('felt_point')
    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(eqMock).toHaveBeenCalledWith('id', 'fp1')
  })

  it('replays sequentially, not concurrently: the second mutation is not dispatched until the first settles', async () => {
    await enqueueMutation({ table: 'felt_point', operation: 'insert', payload: { id: 'fp1' } })
    await enqueueMutation({ table: 'felt_segment', operation: 'insert', payload: { id: 'fs1' } })

    let resolveFirst!: (value: { error: null }) => void
    const firstPromise = new Promise<{ error: null }>((resolve) => {
      resolveFirst = resolve
    })
    const secondInsert = vi.fn(() => Promise.resolve({ error: null }))

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'felt_point') {
        return { insert: vi.fn(() => firstPromise) } as any
      }
      return { insert: secondInsert } as any
    })

    const flushPromise = flushPendingMutations()

    // Let pending microtasks/macrotasks (IndexedDB reads, the first .insert()
    // dispatch) run without ever resolving the first mutation's promise.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(secondInsert).not.toHaveBeenCalled()

    resolveFirst({ error: null })
    await flushPromise

    expect(secondInsert).toHaveBeenCalledTimes(1)
  })
})
