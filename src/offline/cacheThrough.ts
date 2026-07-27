// src/offline/cacheThrough.ts
import { getDB, type PlanIdStoreName } from './db'
import { isOnlineNow } from './connectivity'
import { enqueueMutation, type MutationOperation } from './pendingMutations'
import { SupabaseQueryError } from './supabaseQueryError'

// Every cached row must carry planId — every store this is used for is
// indexed by it (db.ts's PLAN_ID_STORES, typed as PlanIdStoreName). grid_template
// (no plan_id) and grid_line (indexed by gridInstanceId instead) are NOT
// wrapped by this generic helper — see later tasks for their own narrow
// variants. Because `store` is typed as PlanIdStoreName rather than the full
// StoreName union, passing one of those stores here is a compile error, not
// just a runtime DOMException.
interface PlanScoped {
  id: string
  planId: string
}

async function replaceCachedItems<T extends PlanScoped>(
  store: PlanIdStoreName,
  planId: string,
  items: T[]
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(store, 'readwrite')
  const index = tx.store.index('plan_id')
  let cursor = await index.openCursor(IDBKeyRange.only(planId))
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  for (const item of items) {
    await tx.store.put(item)
  }
  await tx.done
}

async function readCachedItems<T extends PlanScoped>(store: PlanIdStoreName, planId: string): Promise<T[]> {
  const db = await getDB()
  return (await db.getAllFromIndex(store, 'plan_id', planId)) as T[]
}

/**
 * List cache-through: tries Supabase (via `fetcher`) when online, refreshing
 * the local cache with the result; falls back to the local cache on network
 * failure or when already known offline (spec §4.5). A `SupabaseQueryError`
 * (a real business error, not a network failure) is re-thrown as-is rather
 * than triggering the cache fallback — see supabaseQueryError.ts.
 *
 * Only the `fetcher()` call itself is covered by the offline/network
 * fallback. Once `fetcher()` has succeeded, refreshing the local cache
 * mirror (`replaceCachedItems`) is a separate step: if THAT throws (quota
 * exceeded, a concurrent tab aborting the transaction, etc.), it is a local
 * storage failure, not a connectivity problem — we already have fresh
 * server data in hand, so silently discarding it and returning stale cached
 * data would be wrong. That error propagates to the caller as-is instead of
 * being folded into the "offline, use the cache" path.
 */
export async function cachedList<T extends PlanScoped>(
  store: PlanIdStoreName,
  planId: string,
  fetcher: () => Promise<T[]>
): Promise<T[]> {
  if (await isOnlineNow()) {
    let items: T[]
    try {
      items = await fetcher()
    } catch (err) {
      if (err instanceof SupabaseQueryError) throw err
      // network failure — fall through to cache
      return readCachedItems<T>(store, planId)
    }
    // fetcher() succeeded — a failure from here on is a local storage
    // problem, not a connectivity problem, and must propagate rather than
    // be silently reinterpreted as "offline, return stale cache".
    await replaceCachedItems(store, planId, items)
    return items
  }
  return readCachedItems<T>(store, planId)
}

/**
 * Write cache-through (insert/update/delete): tries Supabase (via `writer`)
 * when online; on network failure (or when already known offline), applies
 * the change optimistically to the local cache and queues it in
 * `pending_mutations` for replay once connectivity returns (spec §4.5/§4.6).
 * `item` must already carry its final id (client-generated for inserts —
 * see clientId.ts).
 *
 * `toRow` converts the domain object (camelCase, what callers work with) to
 * the exact snake_case shape Supabase expects for this table — the same
 * conversion every repo already does inline for its own `insert`/`update`
 * calls. The QUEUED payload is the ROW form, not the domain form: sync.ts
 * (a later task) replays queued mutations by calling `supabase.from(table)
 * .insert(payload)` directly, with no per-table mapping knowledge of its
 * own — it only ever sees rows, never domain objects. Each repo passes its
 * own existing row-shaping logic as `toRow` rather than duplicating it in
 * sync.ts. As with `cachedList`, a `SupabaseQueryError` is re-thrown as-is
 * instead of being queued as if it were an offline write.
 *
 * Only the `writer()` call itself is covered by the offline/network
 * fallback. Once `writer()` has succeeded, mirroring the result into the
 * local cache (`db.put`/`db.delete`) is a separate step: if THAT throws, it
 * is a local storage failure, not a connectivity problem — the real
 * Supabase write already happened. Folding that failure into the same
 * fallback path would enqueue a duplicate pending mutation for a write that
 * already succeeded; since ids are client-generated, replaying it later
 * would hit a permanent primary-key conflict rather than a transient error.
 * That error therefore propagates to the caller as-is instead.
 *
 * `delete` only needs `item.id` — unlike `insert`/`update`, it never reads
 * `item.planId`, so it's typed via a narrower overload that doesn't require
 * a `planId` field, letting callers pass `{ id }` directly with no cast.
 */
export async function cachedWrite<T extends { id: string }>(
  store: PlanIdStoreName,
  table: string,
  operation: 'delete',
  item: T,
  toRow: (item: T) => unknown,
  writer: () => Promise<T>
): Promise<T>
export async function cachedWrite<T extends PlanScoped>(
  store: PlanIdStoreName,
  table: string,
  operation: 'insert' | 'update',
  item: T,
  toRow: (item: T) => unknown,
  writer: () => Promise<T>
): Promise<T>
export async function cachedWrite<T extends { id: string }>(
  store: PlanIdStoreName,
  table: string,
  operation: MutationOperation,
  item: T,
  toRow: (item: T) => unknown,
  writer: () => Promise<T>
): Promise<T> {
  if (await isOnlineNow()) {
    let result: T
    try {
      result = await writer()
    } catch (err) {
      if (err instanceof SupabaseQueryError) throw err
      // network failure — fall through to queue below
      return queueOffline(store, table, operation, item, toRow)
    }
    // writer() succeeded — a failure from here on is a local storage
    // problem, not a connectivity problem, and must propagate rather than
    // be silently folded into a duplicate queued mutation.
    const db = await getDB()
    if (operation === 'delete') {
      await db.delete(store, result.id)
    } else {
      await db.put(store, result)
    }
    return result
  }
  return queueOffline(store, table, operation, item, toRow)
}

async function queueOffline<T extends { id: string }>(
  store: PlanIdStoreName,
  table: string,
  operation: MutationOperation,
  item: T,
  toRow: (item: T) => unknown
): Promise<T> {
  const db = await getDB()
  if (operation === 'delete') {
    await db.delete(store, item.id)
  } else {
    await db.put(store, item)
  }
  await enqueueMutation({ table, operation, payload: toRow(item) })
  return item
}
