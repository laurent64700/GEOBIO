// src/test/supabaseMock.ts
import { vi } from 'vitest'

export interface SupabaseQueryResult<T> {
  data: T | null
  error: { message: string } | null
}

/**
 * A minimal fake for supabase-js's fluent query builder. Every chained method
 * (insert/select/eq/order/...) returns the same `chain` object; `single()`
 * resolves to `result`, and the chain itself is also thenable so queries that
 * never call `.single()` (e.g. a bare `.select()` list query) can be awaited
 * directly, matching how supabase-js's real builder behaves.
 */
export function createSupabaseChainMock<T>(result: SupabaseQueryResult<T>) {
  const chain: any = {
    insert: vi.fn(() => chain),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: SupabaseQueryResult<T>) => void) => resolve(result),
  }
  const from = vi.fn(() => chain)
  return { from, chain }
}
