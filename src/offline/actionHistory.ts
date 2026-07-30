// src/offline/actionHistory.ts
import { getDB } from './db'

export type ActionEntityType =
  | 'felt_point'
  | 'felt_segment'
  | 'phenomenon'
  | 'context_object'
  | 'grid_instance'
  | 'grid_line'

export type ActionOperation = 'insert' | 'update' | 'delete'

export interface ActionHistoryEntry {
  id: number
  planId: string
  entityType: ActionEntityType
  entityId: string
  operation: ActionOperation
  before: unknown | null
  after: unknown | null
  batchId: string | null
  undone: boolean
  createdAt: string
}

export interface UndoableOptions {
  record?: boolean
  batchId?: string
}

const MAX_BATCHES_PER_PLAN = 10

export async function getEntriesForPlan(planId: string): Promise<ActionHistoryEntry[]> {
  const db = await getDB()
  return (await db.getAllFromIndex('action_history', 'plan_id', planId)) as ActionHistoryEntry[]
}

export async function appendEntry(entry: Omit<ActionHistoryEntry, 'id'>): Promise<void> {
  const db = await getDB()
  await db.add('action_history', entry as ActionHistoryEntry)
}

export async function purgeUndoneEntries(planId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('action_history', 'readwrite')
  const index = tx.store.index('plan_id')
  let cursor = await index.openCursor(IDBKeyRange.only(planId))
  while (cursor) {
    if ((cursor.value as ActionHistoryEntry).undone) {
      await cursor.delete()
    }
    cursor = await cursor.continue()
  }
  await tx.done
}

// A `batchId: null` entry counts as its own one-entry batch (keyed by its own
// id so two different null-batch entries never collide into the same "batch").
function batchKeyOf(entry: ActionHistoryEntry): string {
  return entry.batchId ?? `single:${entry.id}`
}

export async function evictOldestBatchIfOverLimit(planId: string): Promise<void> {
  const entries = await getEntriesForPlan(planId)
  const distinctBatches = new Set(entries.map(batchKeyOf))
  if (distinctBatches.size <= MAX_BATCHES_PER_PLAN) return

  const oldest = entries.reduce((a, b) => (b.id < a.id ? b : a))
  const toDelete =
    oldest.batchId === null ? [oldest] : entries.filter((e) => e.batchId === oldest.batchId)

  const db = await getDB()
  const tx = db.transaction('action_history', 'readwrite')
  for (const e of toDelete) {
    await tx.store.delete(e.id)
  }
  await tx.done
}

export async function undoableWrite<T>(
  planId: string,
  entityType: ActionEntityType,
  operation: ActionOperation,
  before: unknown | null,
  perform: () => Promise<T>,
  options?: UndoableOptions
): Promise<T> {
  const result = await perform()
  if (options?.record ?? true) {
    if (operation === 'delete' && before === null) {
      throw new Error('undoableWrite: delete requires a non-null before snapshot')
    }

    const after = operation === 'delete' ? null : (result as unknown)
    const entityId =
      before !== null ? (before as { id: string }).id : (after as { id: string }).id

    try {
      await purgeUndoneEntries(planId)
      await appendEntry({
        planId,
        entityType,
        entityId,
        operation,
        before,
        after,
        batchId: options?.batchId ?? null,
        undone: false,
        createdAt: new Date().toISOString(),
      })
      await evictOldestBatchIfOverLimit(planId)
    } catch (err) {
      // Recording undo/redo history is best-effort bookkeeping layered on top
      // of the real write, which already succeeded above — never let a
      // recording failure surface as if the write itself failed.
      console.warn('[undo/redo] failed to record action_history entry', err)
    }
  }
  return result
}
