import { supabase } from '../lib/supabaseClient'
import type { GridLine, GridLineFamily, GridLinePolarity, Point } from '../domain/types'
import { getDB } from '../offline/db'
import { isOnlineNow } from '../offline/connectivity'
import { generateClientId } from '../offline/clientId'
import { enqueueMutation } from '../offline/pendingMutations'
import { SupabaseQueryError } from '../offline/supabaseQueryError'

export interface CreateGridLineInput {
  gridInstanceId: string
  family: GridLineFamily
  polarity: GridLinePolarity
  reinforced: boolean
  theoreticalPoints: Point[]
}

interface GridLineRow {
  id: string
  grid_instance_id: string
  family: GridLineFamily
  polarity: GridLinePolarity
  reinforced: boolean
  theoretical_points: Point[]
  adjusted_points: Point[]
}

function mapRowToGridLine(row: GridLineRow): GridLine {
  return {
    id: row.id,
    gridInstanceId: row.grid_instance_id,
    family: row.family,
    polarity: row.polarity,
    reinforced: row.reinforced,
    theoreticalPoints: row.theoretical_points,
    adjustedPoints: row.adjusted_points,
  }
}

// Ids are generated client-side for EVERY line, unconditionally, before any
// online/offline branching (spec §4.1) — this is a deliberate behavior
// change from Postgres's `default gen_random_uuid()`: an offline-created
// batch already has its final ids from the moment of creation, so no
// id-remapping is needed once synced. `grid_line` doesn't use `generated
// always as identity`, so supplying `id` explicitly on insert is safe
// (already verified elsewhere in this offline layer).
//
// Only the Supabase network call (including its business-error check and row
// mapping) is covered by the try/catch below — same scoping rule as the rest
// of this file (see listGridLinesForInstance's doc comment): once the insert
// has succeeded, mirroring the returned rows into the local cache is a
// separate step performed OUTSIDE the try, so a local-write failure at that
// point propagates as its own error instead of being folded into "offline,
// queue the write".
//
// The whole batch is queued as a SINGLE pending mutation whose payload is the
// array of row-form objects — not one mutation per line — because sync.ts
// replays it via `supabase.from('grid_line').insert(payload)`, which natively
// accepts an array in one call, exactly like the online path below.
export async function createGridLines(inputs: CreateGridLineInput[]): Promise<GridLine[]> {
  const rows: GridLineRow[] = inputs.map((i) => ({
    id: generateClientId(),
    grid_instance_id: i.gridInstanceId,
    family: i.family,
    polarity: i.polarity,
    reinforced: i.reinforced,
    theoretical_points: i.theoreticalPoints,
    adjusted_points: i.theoreticalPoints,
  }))

  if (await isOnlineNow()) {
    let lines: GridLine[]
    try {
      const { data, error } = await supabase.from('grid_line').insert(rows).select()
      if (error) throw new SupabaseQueryError(`Impossible de créer les lignes de grille : ${error.message}`)
      lines = (data as GridLineRow[]).map(mapRowToGridLine)
    } catch (err) {
      if (err instanceof SupabaseQueryError) throw err
      // network failure (not a Supabase-reported error) — fall through to
      // the offline cache-and-queue path below.
      return cacheAndQueueGridLines(rows)
    }
    // insert succeeded — mirroring into the cache is a separate step from
    // here on; see the doc comment above for why a failure here must
    // propagate rather than be folded into the offline path.
    const db = await getDB()
    for (const line of lines) {
      await db.put('grid_line', line)
    }
    return lines
  }

  return cacheAndQueueGridLines(rows)
}

async function cacheAndQueueGridLines(rows: GridLineRow[]): Promise<GridLine[]> {
  const lines = rows.map(mapRowToGridLine)
  const db = await getDB()
  for (const line of lines) {
    await db.put('grid_line', line)
  }
  await enqueueMutation({ table: 'grid_line', operation: 'insert', payload: rows })
  return lines
}

// grid_line is indexed by grid_instance_id, NOT plan_id (a plan can contain
// several grid instances, and lines are grouped under their own instance),
// so this doesn't fit `cachedList`/`cachedWrite` from cacheThrough.ts (typed
// to require a PlanIdStoreName). This is a narrow, hand-written cache-through
// variant for this store's own index, in the same spirit as
// gridTemplatesRepo.ts's variant for its unindexed store.
//
// Only the Supabase network call (including its business-error check and row
// mapping) is covered by the try/catch below. Once that call has succeeded,
// refreshing the local cache is a separate step performed OUTSIDE the try —
// see cacheThrough.ts's doc comment for why a local-write failure at that
// point must propagate rather than being folded into "offline, use stale
// cache".
//
// The refresh is scoped to entries matching THIS gridInstanceId only (delete
// via the grid_instance_id index cursor, then insert the fresh list) — never
// a whole-store clear, which would wipe every OTHER grid instance's cached
// lines out from under it.
export async function listGridLinesForInstance(gridInstanceId: string): Promise<GridLine[]> {
  if (await isOnlineNow()) {
    let lines: GridLine[]
    try {
      const { data, error } = await supabase.from('grid_line').select().eq('grid_instance_id', gridInstanceId)
      if (error) throw new SupabaseQueryError(`Impossible de charger les lignes de grille : ${error.message}`)
      lines = (data as GridLineRow[]).map(mapRowToGridLine)
    } catch (err) {
      if (err instanceof SupabaseQueryError) throw err
      // network failure (not a Supabase-reported error) — fall through to cache
      return readCachedLinesForInstance(gridInstanceId)
    }
    await replaceCachedLinesForInstance(gridInstanceId, lines)
    return lines
  }
  return readCachedLinesForInstance(gridInstanceId)
}

async function readCachedLinesForInstance(gridInstanceId: string): Promise<GridLine[]> {
  const db = await getDB()
  return (await db.getAllFromIndex('grid_line', 'grid_instance_id', gridInstanceId)) as GridLine[]
}

async function replaceCachedLinesForInstance(gridInstanceId: string, lines: GridLine[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('grid_line', 'readwrite')
  const index = tx.store.index('grid_instance_id')
  let cursor = await index.openCursor(IDBKeyRange.only(gridInstanceId))
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  for (const line of lines) {
    await tx.store.put(line)
  }
  await tx.done
}

// Attempts the Supabase update; returns the mapped domain line on success,
// re-throws SupabaseQueryError as-is, or returns null on a genuine network
// failure so the caller falls through to the offline patch-and-queue path.
// This try/catch covers ONLY the network call — mirroring the result into
// the cache is the caller's job, deliberately kept outside this function so
// a local-write failure after a successful write propagates on its own
// instead of being reinterpreted as "offline, patch and queue instead".
async function tryOnlineLineUpdate(
  lineId: string,
  update: Partial<Pick<GridLineRow, 'theoretical_points' | 'adjusted_points'>>,
  errorPrefix: string
): Promise<GridLine | null> {
  try {
    const { data, error } = await supabase.from('grid_line').update(update).eq('id', lineId).select().single()
    if (error) throw new SupabaseQueryError(`${errorPrefix} : ${error.message}`)
    return mapRowToGridLine(data as GridLineRow)
  } catch (err) {
    if (err instanceof SupabaseQueryError) throw err
    return null
  }
}

// updateAdjustedPoints and updateLinePoints share the same cached grid_line
// record, so the offline path always reads the EXISTING cached line first
// and patches only its own field(s) on top of it — this way updating
// adjustedPoints never clobbers theoreticalPoints, and vice versa.
async function getCachedLineOrThrow(lineId: string, errorPrefix: string): Promise<GridLine> {
  const db = await getDB()
  const existing = (await db.get('grid_line', lineId)) as GridLine | undefined
  if (!existing) {
    throw new Error(`${errorPrefix} : la ligne ${lineId} est introuvable dans le cache local`)
  }
  return existing
}

export async function updateAdjustedPoints(lineId: string, adjustedPoints: Point[]): Promise<GridLine> {
  if (await isOnlineNow()) {
    const line = await tryOnlineLineUpdate(
      lineId,
      { adjusted_points: adjustedPoints },
      'Impossible de mettre à jour la ligne'
    )
    if (line) {
      // The write already succeeded — mirroring the full server row into
      // the cache is a separate step from here on: if THIS throws (a local
      // storage problem), it must propagate as its own error rather than
      // being folded into the offline path below.
      const db = await getDB()
      await db.put('grid_line', line)
      return line
    }
  }

  const existing = await getCachedLineOrThrow(lineId, 'Impossible de mettre à jour la ligne')
  const line: GridLine = { ...existing, adjustedPoints }
  const db = await getDB()
  await db.put('grid_line', line)
  await enqueueMutation({
    table: 'grid_line',
    operation: 'update',
    payload: { id: lineId, adjusted_points: adjustedPoints },
  })
  return line
}

// Used by grid recalibration (translateGridLine shifts BOTH point arrays by
// the same rigid delta, unlike a felt-adjustment drag which only ever
// touches adjustedPoints via updateAdjustedPoints above).
export async function updateLinePoints(
  lineId: string,
  theoreticalPoints: Point[],
  adjustedPoints: Point[]
): Promise<GridLine> {
  if (await isOnlineNow()) {
    const line = await tryOnlineLineUpdate(
      lineId,
      { theoretical_points: theoreticalPoints, adjusted_points: adjustedPoints },
      'Impossible de recaler la ligne'
    )
    if (line) {
      const db = await getDB()
      await db.put('grid_line', line)
      return line
    }
  }

  const existing = await getCachedLineOrThrow(lineId, 'Impossible de recaler la ligne')
  const line: GridLine = { ...existing, theoreticalPoints, adjustedPoints }
  const db = await getDB()
  await db.put('grid_line', line)
  await enqueueMutation({
    table: 'grid_line',
    operation: 'update',
    payload: {
      id: lineId,
      theoretical_points: theoreticalPoints,
      adjusted_points: adjustedPoints,
    },
  })
  return line
}
