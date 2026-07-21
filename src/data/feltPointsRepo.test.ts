import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFeltPoint, deleteFeltPoint, listFeltPointsForPlan } from './feltPointsRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('feltPointsRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a felt point', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'fp1', plan_id: 'p1', network_name: 'Hartmann',
        x: 1.2, y: -3.4, created_at: '2026-07-16T10:00:00Z',
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const point = await createFeltPoint({ planId: 'p1', networkName: 'Hartmann', x: 1.2, y: -3.4 })

    expect(from).toHaveBeenCalledWith('felt_point')
    expect(chain.insert).toHaveBeenCalledWith({
      plan_id: 'p1', network_name: 'Hartmann', x: 1.2, y: -3.4,
    })
    expect(point.networkName).toBe('Hartmann')
  })

  it('throws a descriptive French error when creation fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(
      createFeltPoint({ planId: 'p1', networkName: 'Hartmann', x: 0, y: 0 })
    ).rejects.toThrow("Impossible d'enregistrer le point ressenti : network down")
  })

  it('lists felt points scoped to a plan', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [
        { id: 'fp1', plan_id: 'p1', network_name: 'Hartmann', x: 0, y: 0, created_at: '2026-07-16T10:00:00Z' },
        { id: 'fp2', plan_id: 'p1', network_name: 'Curry', x: 1, y: 1, created_at: '2026-07-16T10:05:00Z' },
      ],
      error: null,
    })
    vi.mocked(supabase).from = from

    const points = await listFeltPointsForPlan('p1')

    expect(chain.eq).toHaveBeenCalledWith('plan_id', 'p1')
    expect(points).toHaveLength(2)
    expect(points.map((p) => p.networkName)).toEqual(['Hartmann', 'Curry'])
  })

  it('deletes a felt point', async () => {
    const { from, chain } = createSupabaseChainMock({ data: null, error: null })
    vi.mocked(supabase).from = from

    await deleteFeltPoint('fp1')

    expect(from).toHaveBeenCalledWith('felt_point')
    expect(chain.eq).toHaveBeenCalledWith('id', 'fp1')
  })

  it('throws a descriptive French error when deletion fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(deleteFeltPoint('fp1')).rejects.toThrow(
      'Impossible de supprimer le point ressenti : network down'
    )
  })
})
