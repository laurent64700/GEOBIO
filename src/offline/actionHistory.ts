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

import type { FeltPoint, FeltSegment, Phenomenon, ContextObject, GridInstance, GridLine } from '../domain/types'
import { deleteFeltPoint, restoreFeltPoint } from '../data/feltPointsRepo'
import { deleteFeltSegment, restoreFeltSegment } from '../data/feltSegmentsRepo'
import { deletePhenomenon, restorePhenomenon } from '../data/phenomenaRepo'
import { deleteContextObject, restoreContextObject } from '../data/contextObjectsRepo'
import { updateGridInstanceOrigin } from '../data/gridInstancesRepo'
import { updateLinePoints } from '../data/gridLinesRepo'

export async function hasUndoableAction(planId: string): Promise<boolean> {
  const entries = await getEntriesForPlan(planId)
  return entries.some((e) => !e.undone)
}

export async function hasRedoableAction(planId: string): Promise<boolean> {
  const entries = await getEntriesForPlan(planId)
  return entries.some((e) => e.undone)
}

async function deleteByEntityType(entityType: ActionEntityType, entityId: string): Promise<void> {
  switch (entityType) {
    case 'felt_point': return deleteFeltPoint(entityId, { record: false })
    case 'felt_segment': return deleteFeltSegment(entityId, { record: false })
    case 'phenomenon': return deletePhenomenon(entityId, { record: false })
    case 'context_object': return deleteContextObject(entityId, { record: false })
    default:
      throw new Error(`deleteByEntityType : ${entityType} n'a pas de suppression annulable (spec §2)`)
  }
}

async function restoreByEntityType(entityType: ActionEntityType, item: unknown): Promise<void> {
  switch (entityType) {
    case 'felt_point': await restoreFeltPoint(item as FeltPoint); return
    case 'felt_segment': await restoreFeltSegment(item as FeltSegment); return
    case 'phenomenon': await restorePhenomenon(item as Phenomenon); return
    case 'context_object': await restoreContextObject(item as ContextObject); return
    default:
      throw new Error(`restoreByEntityType : ${entityType} n'a pas de restauration (spec §2)`)
  }
}

async function updateByEntityType(
  entityType: ActionEntityType,
  entityId: string,
  value: unknown,
  planId: string
): Promise<void> {
  if (entityType === 'grid_instance') {
    const instance = value as GridInstance
    await updateGridInstanceOrigin(entityId, instance.originX, instance.originY, { record: false })
    return
  }
  if (entityType === 'grid_line') {
    const line = value as GridLine
    // ALWAYS updateLinePoints, never updateAdjustedPoints — before/after are
    // full GridLine snapshots (both point arrays), and only updateLinePoints
    // restores both unconditionally.
    await updateLinePoints(entityId, line.theoreticalPoints, line.adjustedPoints, planId, { record: false })
    return
  }
  throw new Error(`updateByEntityType : ${entityType} n'a pas de mise à jour annulable (spec §2)`)
}

async function applyInverse(entry: ActionHistoryEntry): Promise<void> {
  if (entry.operation === 'insert') {
    await deleteByEntityType(entry.entityType, entry.entityId)
  } else if (entry.operation === 'delete') {
    await restoreByEntityType(entry.entityType, entry.before)
  } else {
    await updateByEntityType(entry.entityType, entry.entityId, entry.before, entry.planId)
  }
}

async function applyForward(entry: ActionHistoryEntry): Promise<void> {
  if (entry.operation === 'insert') {
    // restoreX(after), never createX again — createX would generate a fresh
    // id via generateClientId(), orphaning this history entry.
    await restoreByEntityType(entry.entityType, entry.after)
  } else if (entry.operation === 'delete') {
    await deleteByEntityType(entry.entityType, entry.entityId)
  } else {
    await updateByEntityType(entry.entityType, entry.entityId, entry.after, entry.planId)
  }
}

async function setUndoneFlag(ids: number[], undone: boolean): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('action_history', 'readwrite')
  for (const id of ids) {
    const entry = (await tx.store.get(id)) as ActionHistoryEntry | undefined
    if (entry) {
      entry.undone = undone
      await tx.store.put(entry)
    }
  }
  await tx.done
}

// undo()/redo() assume the caller (the UI) prevents concurrent calls for the
// same plan, e.g. by disabling the trigger button while a call is in flight
// — no reentrancy guard exists at this layer.
export async function undo(planId: string): Promise<void> {
  const entries = await getEntriesForPlan(planId)
  const undoable = entries.filter((e) => !e.undone)
  if (undoable.length === 0) return
  const last = undoable.reduce((a, b) => (b.id > a.id ? b : a))
  const batch = last.batchId === null ? [last] : undoable.filter((e) => e.batchId === last.batchId)

  // If applyInverse throws partway through a multi-entry batch, entries
  // already processed have their real-data mutation applied but
  // setUndoneFlag never runs for ANY entry in the batch (it's only called
  // after the loop fully completes) — action_history stays inconsistent
  // with real data until the next undo() retries the whole batch. This is
  // self-healing today because every batchId in this codebase is
  // update-only (grid recalibration: updateGridInstanceOrigin + N ×
  // updateLinePoints) and retrying an idempotent update is harmless — but a
  // future feature that batches insert/delete operations would NOT get
  // this safety for free (a retried delete/restore on an
  // already-deleted/restored entity would throw instead of no-op).
  for (const entry of batch) {
    await applyInverse(entry)
  }
  await setUndoneFlag(batch.map((e) => e.id), true)
}

// undo()/redo() assume the caller (the UI) prevents concurrent calls for the
// same plan, e.g. by disabling the trigger button while a call is in flight
// — no reentrancy guard exists at this layer.
export async function redo(planId: string): Promise<void> {
  const entries = await getEntriesForPlan(planId)
  const redoable = entries.filter((e) => e.undone)
  if (redoable.length === 0) return
  const oldest = redoable.reduce((a, b) => (b.id < a.id ? b : a))
  const batch = oldest.batchId === null ? [oldest] : redoable.filter((e) => e.batchId === oldest.batchId)

  // If applyForward throws partway through a multi-entry batch, entries
  // already processed have their real-data mutation applied but
  // setUndoneFlag never runs for ANY entry in the batch (it's only called
  // after the loop fully completes) — action_history stays inconsistent
  // with real data until the next redo() retries the whole batch. This is
  // self-healing today because every batchId in this codebase is
  // update-only (grid recalibration: updateGridInstanceOrigin + N ×
  // updateLinePoints) and retrying an idempotent update is harmless — but a
  // future feature that batches insert/delete operations would NOT get
  // this safety for free (a retried delete/restore on an
  // already-deleted/restored entity would throw instead of no-op).
  for (const entry of batch) {
    await applyForward(entry)
  }
  await setUndoneFlag(batch.map((e) => e.id), false)
}
