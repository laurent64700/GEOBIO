// src/offline/cacheThrough.ts
import { getDB, type StoreName } from './db'
import { isOnlineNow } from './connectivity'
import { enqueueMutation, type MutationOperation } from './pendingMutations'
import { SupabaseQueryError } from './supabaseQueryError'

// Every cached row must carry planId — every store this is used for is
// indexed by it (db.ts's PLAN_ID_STORES). grid_template (no plan_id) and
// grid_line (indexed by gridInstanceId instead) are NOT wrapped by this
// generic helper — see later tasks for their own narrow variants.
interface PlanScoped {
  id: string
  planId: string
}

async function replaceCachedItems<T extends PlanScoped>(
  store: StoreName,
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

async function readCachedItems<T extends PlanScoped>(store: StoreName, planId: string): Promise<T[]> {
  const db = await getDB()
  return (await db.getAllFromIndex(store, 'plan_id', planId)) as T[]
}

/**
 * List cache-through: tries Supabase (via `fetcher`) when online, refreshing
 * the local cache with the result; falls back to the local cache on network
 * failure or when already known offline (spec §4.5). A `SupabaseQueryError`
 * (a real business error, not a network failure) is re-thrown as-is rather
 * than triggering the cache fallback — see supabaseQueryError.ts.
 */
export async function cachedList<T extends PlanScoped>(
  store: StoreName,
  planId: string,
  fetcher: () => Promise<T[]>
): Promise<T[]> {
  if (await isOnlineNow()) {
    try {
      const items = await fetcher()
      await replaceCachedItems(store, planId, items)
      return items
    } catch (err) {
      if (err instanceof SupabaseQueryError) throw err
      // fall through to cache on network failure
    }
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
 */
export async function cachedWrite<T extends PlanScoped>(
  store: StoreName,
  table: string,
  operation: MutationOperation,
  item: T,
  toRow: (item: T) => unknown,
  writer: () => Promise<T>
): Promise<T> {
  if (await isOnlineNow()) {
    try {
      const result = await writer()
      const db = await getDB()
      if (operation === 'delete') {
        await db.delete(store, result.id)
      } else {
        await db.put(store, result)
      }
      return result
    } catch (err) {
      if (err instanceof SupabaseQueryError) throw err
      // fall through to queue on network failure
    }
  }
  const db = await getDB()
  if (operation === 'delete') {
    await db.delete(store, item.id)
  } else {
    await db.put(store, item)
  }
  await enqueueMutation({ table, operation, payload: toRow(item) })
  return item
}
