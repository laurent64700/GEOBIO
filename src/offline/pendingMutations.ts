import { getDB } from './db'

export type MutationOperation = 'insert' | 'update' | 'delete'

export interface PendingMutation {
  id: number
  table: string
  operation: MutationOperation
  payload: unknown
  createdAt: string
  // Tracked on every failed replay (see incrementAttempts / sync.ts), but
  // currently has no cap and no consumer — no code reads this field today.
  attempts: number
}

export type EnqueueMutationInput = Pick<PendingMutation, 'table' | 'operation' | 'payload'>

export async function enqueueMutation(input: EnqueueMutationInput): Promise<void> {
  const db = await getDB()
  await db.add('pending_mutations', {
    ...input,
    createdAt: new Date().toISOString(),
    attempts: 0,
  } as unknown as PendingMutation)
}

// getAll() returns entries in primary-key order for an auto-incrementing key,
// which is insertion order here — exactly the FIFO replay order sync needs.
export async function listPendingMutations(): Promise<PendingMutation[]> {
  const db = await getDB()
  return (await db.getAll('pending_mutations')) as PendingMutation[]
}

export async function removePendingMutation(id: number): Promise<void> {
  const db = await getDB()
  await db.delete('pending_mutations', id)
}

export async function incrementAttempts(id: number): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('pending_mutations', 'readwrite')
  const entry = (await tx.store.get(id)) as PendingMutation | undefined
  if (entry) {
    entry.attempts += 1
    await tx.store.put(entry)
  }
  await tx.done
}
