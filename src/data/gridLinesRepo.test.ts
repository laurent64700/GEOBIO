import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGridLines, listGridLinesForInstance, updateAdjustedPoints, updateLinePoints } from './gridLinesRepo'
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

  it('lists grid lines scoped to a grid instance', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [
        {
          id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: true,
          theoretical_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
          adjusted_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
        },
      ],
      error: null,
    })
    vi.mocked(supabase).from = from

    const lines = await listGridLinesForInstance('gi1')

    expect(chain.eq).toHaveBeenCalledWith('grid_instance_id', 'gi1')
    expect(lines).toHaveLength(1)
  })

  it('updates a single line\'s adjusted points', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: false,
        theoretical_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
        adjusted_points: [{ x: 0.3, y: -3 }, { x: 0, y: 3 }],
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const line = await updateAdjustedPoints('gl1', [{ x: 0.3, y: -3 }, { x: 0, y: 3 }])

    expect(chain.eq).toHaveBeenCalledWith('id', 'gl1')
    expect(chain.update).toHaveBeenCalledWith({ adjusted_points: [{ x: 0.3, y: -3 }, { x: 0, y: 3 }] })
    expect(line.adjustedPoints).toEqual([{ x: 0.3, y: -3 }, { x: 0, y: 3 }])
  })

  it('updates both theoretical and adjusted points of a line (grid recalibration)', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: false,
        theoretical_points: [{ x: 2, y: -1 }, { x: 2, y: 5 }],
        adjusted_points: [{ x: 2.4, y: -1 }, { x: 2, y: 5 }],
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const line = await updateLinePoints(
      'gl1',
      [{ x: 2, y: -1 }, { x: 2, y: 5 }],
      [{ x: 2.4, y: -1 }, { x: 2, y: 5 }]
    )

    expect(chain.eq).toHaveBeenCalledWith('id', 'gl1')
    expect(chain.update).toHaveBeenCalledWith({
      theoretical_points: [{ x: 2, y: -1 }, { x: 2, y: 5 }],
      adjusted_points: [{ x: 2.4, y: -1 }, { x: 2, y: 5 }],
    })
    expect(line.theoreticalPoints).toEqual([{ x: 2, y: -1 }, { x: 2, y: 5 }])
    expect(line.adjustedPoints).toEqual([{ x: 2.4, y: -1 }, { x: 2, y: 5 }])
  })
})
