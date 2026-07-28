// src/offline/sync.ts
import { supabase } from '../lib/supabaseClient'
import { listPendingMutations, removePendingMutation, incrementAttempts, type PendingMutation } from './pendingMutations'

// Replays one queued mutation against Supabase. `mutation.payload` is
// already in Supabase row form (snake_case) — every repo's `cachedWrite`
// converts domain objects to rows via its own `toRow` before enqueueing
// (see cacheThrough.ts), specifically so this module stays fully generic
// with zero per-table mapping knowledge of its own.
function replay(mutation: PendingMutation): PromiseLike<{ error: { message: string } | null }> {
  const { table, operation, payload } = mutation

  switch (operation) {
    case 'insert':
      // `payload` may be a single row object OR an array of rows (bulk
      // grid_line inserts from Task 4.2) — supabase-js's `.insert()`
      // accepts both natively through the same call, so no special-casing
      // is needed here.
      return supabase.from(table).insert(payload as never)
    case 'update': {
      const { id, ...patch } = payload as { id: string } & Record<string, unknown>
      return supabase.from(table).update(patch as never).eq('id', id)
    }
    case 'delete': {
      const { id } = payload as { id: string }
      return supabase.from(table).delete().eq('id', id)
    }
  }
}

/**
 * Replays every queued offline mutation against Supabase, in strict FIFO
 * (enqueue) order, one at a time — sequentially, not concurrently, since a
 * later mutation may depend on an earlier one touching the same record
 * (spec §4.6).
 *
 * Unlike cacheThrough.ts / the repos, this module does NOT distinguish a
 * `SupabaseQueryError` (permanent business error) from a network failure:
 * by the time a mutation reaches this queue, the local write has already
 * happened, so there's no "which path to take" decision left — only
 * "retry now or later". Any failure (a Supabase-reported `{ error }` or the
 * call itself throwing/rejecting) increments `attempts` and leaves the
 * mutation queued; it never stops or blocks replay of the remaining
 * mutations.
 */
export async function flushPendingMutations(): Promise<void> {
  const mutations = await listPendingMutations()

  for (const mutation of mutations) {
    try {
      const { error } = await replay(mutation)
      if (error) {
        await incrementAttempts(mutation.id)
      } else {
        await removePendingMutation(mutation.id)
      }
    } catch {
      await incrementAttempts(mutation.id)
    }
  }
}
