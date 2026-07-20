import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFeltSegment, deleteFeltSegment, listFeltSegmentsForPlan } from './feltSegmentsRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('feltSegmentsRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a felt segment', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'fs1', plan_id: 'p1', network_name: 'Hartmann',
        ax: 1, ay: 2, bx: 3, by: 4, created_at: '2026-07-20T10:00:00Z',
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const segment = await createFeltSegment({
      planId: 'p1', networkName: 'Hartmann', pointA: { x: 1, y: 2 }, pointB: { x: 3, y: 4 },
    })

    expect(from).toHaveBeenCalledWith('felt_segment')
    expect(chain.insert).toHaveBeenCalledWith({
      plan_id: 'p1', network_name: 'Hartmann', ax: 1, ay: 2, bx: 3, by: 4,
    })
    expect(segment.pointA).toEqual({ x: 1, y: 2 })
    expect(segment.pointB).toEqual({ x: 3, y: 4 })
  })

  it('throws a descriptive French error when creation fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(
      createFeltSegment({ planId: 'p1', networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 1, y: 1 } })
    ).rejects.toThrow("Impossible d'enregistrer le segment ressenti : network down")
  })

  it('lists felt segments scoped to a plan', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [
        { id: 'fs1', plan_id: 'p1', network_name: 'Hartmann', ax: 0, ay: 0, bx: 1, by: 1, created_at: '2026-07-20T10:00:00Z' },
      ],
      error: null,
    })
    vi.mocked(supabase).from = from

    const segments = await listFeltSegmentsForPlan('p1')

    expect(chain.eq).toHaveBeenCalledWith('plan_id', 'p1')
    expect(segments).toHaveLength(1)
    expect(segments[0].networkName).toBe('Hartmann')
  })

  it('deletes a felt segment', async () => {
    const { from, chain } = createSupabaseChainMock({ data: null, error: null })
    vi.mocked(supabase).from = from

    await deleteFeltSegment('fs1')

    expect(from).toHaveBeenCalledWith('felt_segment')
    expect(chain.eq).toHaveBeenCalledWith('id', 'fs1')
  })

  it('throws a descriptive French error when deletion fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(deleteFeltSegment('fs1')).rejects.toThrow(
      'Impossible de supprimer le segment ressenti : network down'
    )
  })
})
