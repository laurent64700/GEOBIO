import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGridInstance } from './gridInstancesRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

const hartmann = {
  id: 't0', name: 'Hartmann', spacingXM: 2, spacingYM: 2.5,
  angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0, color: '#d32f2f',
  vibratoryBase: 7,
}

describe('gridInstancesRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a grid instance with a frozen template snapshot', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: { id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 1.5, origin_y: -2 },
      error: null,
    })
    vi.mocked(supabase).from = from

    const instance = await createGridInstance({
      planId: 'p1', templateSnapshot: hartmann, originX: 1.5, originY: -2,
    })

    expect(from).toHaveBeenCalledWith('grid_instance')
    expect(chain.insert).toHaveBeenCalledWith({
      plan_id: 'p1', template_snapshot: hartmann, origin_x: 1.5, origin_y: -2,
    })
    expect(instance.templateSnapshot).toEqual(hartmann)
  })
})
