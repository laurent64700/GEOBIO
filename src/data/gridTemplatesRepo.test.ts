import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGridTemplate, listGridTemplates } from './gridTemplatesRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('gridTemplatesRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a grid template and maps the row to camelCase', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 't1', name: 'Curry', spacing_x_m: 2, spacing_y_m: 2,
        angle_true_north_deg: 45, origin_offset_x: 0, origin_offset_y: 0, color: '#52a675',
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const template = await createGridTemplate({
      name: 'Curry', spacingXM: 2, spacingYM: 2, angleTrueNorthDeg: 45,
      originOffsetX: 0, originOffsetY: 0, color: '#52a675',
    })

    expect(from).toHaveBeenCalledWith('grid_template')
    expect(chain.insert).toHaveBeenCalledWith({
      name: 'Curry', spacing_x_m: 2, spacing_y_m: 2,
      angle_true_north_deg: 45, origin_offset_x: 0, origin_offset_y: 0, color: '#52a675',
    })
    expect(template.name).toBe('Curry')
  })

  it('lists all grid templates', async () => {
    const { from } = createSupabaseChainMock({
      data: [
        { id: 't0', name: 'Hartmann', spacing_x_m: 2, spacing_y_m: 2.5, angle_true_north_deg: 0, origin_offset_x: 0, origin_offset_y: 0, color: '#d32f2f' },
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
      createGridTemplate({ name: 'Hartmann', spacingXM: 2, spacingYM: 2.5, angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0, color: '#d32f2f' })
    ).rejects.toThrow('Impossible de créer le gabarit de grille : duplicate key value')
  })
})
