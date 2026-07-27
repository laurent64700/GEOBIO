// Thrown by every repo when Supabase itself responds with `{ error }` (a
// real business/query error — constraint violation, RLS, malformed query,
// etc.) — as opposed to a genuine network failure (fetch throwing a
// TypeError/AbortError). cacheThrough.ts re-throws this type instead of
// treating it as "offline, fall back to cache/queue" (see its own doc
// comment for why the distinction matters).
export class SupabaseQueryError extends Error {}
