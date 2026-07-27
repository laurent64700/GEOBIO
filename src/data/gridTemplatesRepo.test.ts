import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createGridTemplate, listGridTemplates } from './gridTemplatesRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'
import { getDB } from '../offline/db'
import * as connectivity from '../offline/connectivity'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../offline/connectivity')

// `vi.mock('../offline/connectivity')` auto-mock applies to the WHOLE file,
// including the pre-existing tests below that don't know about
// `isOnlineNow` and don't configure a return value. An unconfigured
// auto-mock resolves `undefined` (falsy) by default, so every existing test
// would silently take the offline branch, read an empty IndexedDB cache, and
// get `[]` instead of the mocked data from `createSupabaseChainMock` — making
// them all fail. This root-scope `beforeEach` makes `isOnlineNow` resolve
// `true` by default everywhere, except where a test explicitly overrides it
// to `false`.
beforeEach(() => {
  vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
})

describe('gridTemplatesRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a grid template and maps the row to camelCase', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 't1', name: 'Curry', spacing_x_m: 2, spacing_y_m: 2,
        angle_true_north_deg: 45, origin_offset_x: 0, origin_offset_y: 0, color: '#52a675',
        vibratory_base: 5,
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const template = await createGridTemplate({
      name: 'Curry', spacingXM: 2, spacingYM: 2, angleTrueNorthDeg: 45,
      originOffsetX: 0, originOffsetY: 0, color: '#52a675', vibratoryBase: 5,
    })

    expect(from).toHaveBeenCalledWith('grid_template')
    expect(chain.insert).toHaveBeenCalledWith({
      name: 'Curry', spacing_x_m: 2, spacing_y_m: 2,
      angle_true_north_deg: 45, origin_offset_x: 0, origin_offset_y: 0, color: '#52a675',
      vibratory_base: 5,
    })
    expect(template.name).toBe('Curry')
  })

  it('lists all grid templates', async () => {
    const { from } = createSupabaseChainMock({
      data: [
        { id: 't0', name: 'Hartmann', spacing_x_m: 2, spacing_y_m: 2.5, angle_true_north_deg: 0, origin_offset_x: 0, origin_offset_y: 0, color: '#d32f2f', vibratory_base: 7 },
      ],
      error: null,
    })
    vi.mocked(supabase).from = from

    const templates = await listGridTemplates()
    expect(templates).toHaveLength(1)
    expect(templates[0].name).toBe('Hartmann')
  })

  it('throws a descriptive French error when creation fails (e.g. duplicate name)', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'duplicate key value' } })
    vi.mocked(supabase).from = from

    await expect(
      createGridTemplate({ name: 'Hartmann', spacingXM: 2, spacingYM: 2.5, angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0, color: '#d32f2f', vibratoryBase: 5 })
    ).rejects.toThrow('Impossible de créer le gabarit de grille : duplicate key value')
  })
})

describe('listGridTemplates — offline fallback', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('grid_template')
  })

  it('falls back to the local cache when the online fetch fails, after having cached it once online', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    const { from } = createSupabaseChainMock({
      data: [{ id: 't0', name: 'Hartmann', spacing_x_m: 1.8, spacing_y_m: 2.5, angle_true_north_deg: 0, origin_offset_x: 0, origin_offset_y: 0, color: '#d32f2f', vibratory_base: 7 }],
      error: null,
    })
    vi.mocked(supabase).from = from
    await listGridTemplates() // primes the cache while "online"

    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    const templates = await listGridTemplates()

    expect(templates).toHaveLength(1)
    expect(templates[0].name).toBe('Hartmann')
  })
})
