import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { enqueueMutation, listPendingMutations, removePendingMutation, incrementAttempts } from './pendingMutations'
import { getDB } from './db'

describe('pendingMutations', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('pending_mutations')
  })

  it('enqueues a mutation and lists it back with attempts starting at 0', async () => {
    await enqueueMutation({ table: 'felt_point', operation: 'insert', payload: { id: 'fp1' } })

    const pending = await listPendingMutations()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ table: 'felt_point', operation: 'insert', attempts: 0 })
    expect(pending[0].payload).toEqual({ id: 'fp1' })
  })

  it('lists mutations in FIFO order (insertion order)', async () => {
    await enqueueMutation({ table: 'felt_point', operation: 'insert', payload: { id: 'fp1' } })
    await enqueueMutation({ table: 'felt_point', operation: 'insert', payload: { id: 'fp2' } })

    const pending = await listPendingMutations()
    expect(pending.map((p) => p.payload)).toEqual([{ id: 'fp1' }, { id: 'fp2' }])
  })

  it('removes a mutation by its queue id', async () => {
    await enqueueMutation({ table: 'felt_point', operation: 'insert', payload: { id: 'fp1' } })
    const [first] = await listPendingMutations()

    await removePendingMutation(first.id)

    expect(await listPendingMutations()).toHaveLength(0)
  })

  it('increments the attempts counter without removing the entry', async () => {
    await enqueueMutation({ table: 'felt_point', operation: 'insert', payload: { id: 'fp1' } })
    const [first] = await listPendingMutations()

    await incrementAttempts(first.id)

    const [after] = await listPendingMutations()
    expect(after.attempts).toBe(1)
  })
})
