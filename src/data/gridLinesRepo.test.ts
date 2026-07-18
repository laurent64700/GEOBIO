import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGridLines } from './gridLinesRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('gridLinesRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('bulk-creates grid lines with adjustedPoints initialized to theoreticalPoints', async () => {
    const rows = [
      {
        id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: true,
        theoretical_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
        adjusted_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
      },
    ]
    const { from, chain } = createSupabaseChainMock({ data: rows, error: null })
    vi.mocked(supabase).from = from

    const lines = await createGridLines([
      { gridInstanceId: 'gi1', family: 'axis-a', polarity: '+', reinforced: true, theoreticalPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }] },
    ])

    expect(from).toHaveBeenCalledWith('grid_line')
    expect(chain.insert).toHaveBeenCalledWith([
      {
        grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: true,
        theoretical_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
        adjusted_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
      },
    ])
    expect(lines[0].adjustedPoints).toEqual(lines[0].theoreticalPoints)
  })
})
