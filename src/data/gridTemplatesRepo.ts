import { supabase } from '../lib/supabaseClient'
import type { GridTemplate } from '../domain/types'
import { getDB } from '../offline/db'
import { isOnlineNow } from '../offline/connectivity'
import { SupabaseQueryError } from '../offline/supabaseQueryError'

export interface CreateGridTemplateInput {
  name: string
  spacingXM: number
  spacingYM: number
  angleTrueNorthDeg: number
  originOffsetX: number
  originOffsetY: number
  color: string
  vibratoryBase: number
}

interface GridTemplateRow {
  id: string
  name: string
  spacing_x_m: number
  spacing_y_m: number
  angle_true_north_deg: number
  origin_offset_x: number
  origin_offset_y: number
  color: string
  vibratory_base: number
}

function mapRowToGridTemplate(row: GridTemplateRow): GridTemplate {
  return {
    id: row.id,
    name: row.name,
    spacingXM: row.spacing_x_m,
    spacingYM: row.spacing_y_m,
    angleTrueNorthDeg: row.angle_true_north_deg,
    originOffsetX: row.origin_offset_x,
    originOffsetY: row.origin_offset_y,
    color: row.color,
    vibratoryBase: row.vibratory_base,
  }
}

export async function createGridTemplate(input: CreateGridTemplateInput): Promise<GridTemplate> {
  const { data, error } = await supabase
    .from('grid_template')
    .insert({
      name: input.name,
      spacing_x_m: input.spacingXM,
      spacing_y_m: input.spacingYM,
      angle_true_north_deg: input.angleTrueNorthDeg,
      origin_offset_x: input.originOffsetX,
      origin_offset_y: input.originOffsetY,
      color: input.color,
      vibratory_base: input.vibratoryBase,
    })
    .select()
    .single()

  if (error) throw new Error(`Impossible de créer le gabarit de grille : ${error.message}`)
  return mapRowToGridTemplate(data as GridTemplateRow)
}

// grid_template has no plan_id (it's a small global reference table — the 5
// confirmed geobiology networks), so it doesn't fit `cachedList` from
// cacheThrough.ts (typed to require a PlanIdStoreName). This is a narrow,
// hand-written cache-through variant for this one store rather than
// complicating the generic helper for a single exception (YAGNI).
//
// Only the Supabase network call (including its business-error check and row
// mapping) is covered by the try/catch below. Once that call has succeeded,
// refreshing the local IndexedDB mirror is a separate step performed OUTSIDE
// the try: if the local write fails (quota exceeded, a concurrent tab
// aborting the transaction, etc.), that's a local storage failure, not a
// connectivity problem — we already have fresh server data in hand, so
// silently discarding it and falling back to stale cached data would be
// wrong. That error propagates to the caller as-is instead of being folded
// into the "offline, use the cache" path.
export async function listGridTemplates(): Promise<GridTemplate[]> {
  if (await isOnlineNow()) {
    let templates: GridTemplate[]
    try {
      const { data, error } = await supabase.from('grid_template').select()
      if (error) throw new SupabaseQueryError(`Impossible de charger les gabarits de grille : ${error.message}`)
      templates = (data as GridTemplateRow[]).map(mapRowToGridTemplate)
    } catch (err) {
      if (err instanceof SupabaseQueryError) throw err
      // network failure (not a Supabase-reported error) — fall through to cache
      const db = await getDB()
      return db.getAll('grid_template') as Promise<GridTemplate[]>
    }
    // network call succeeded — a failure from here on is a local storage
    // problem, not a connectivity problem, and must propagate rather than be
    // silently reinterpreted as "offline, return stale cache".
    const db = await getDB()
    const tx = db.transaction('grid_template', 'readwrite')
    await tx.store.clear()
    for (const t of templates) await tx.store.put(t)
    await tx.done
    return templates
  }
  const db = await getDB()
  return db.getAll('grid_template') as Promise<GridTemplate[]>
}
