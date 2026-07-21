import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPhenomenon, deletePhenomenon, listPhenomenaForPlan } from './phenomenaRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('phenomenaRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a phenomenon', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: { id: 'ph1', plan_id: 'p1', kind: 'spire-vortex', x: 1, y: 2, created_at: '2026-07-21T10:00:00Z' },
      error: null,
    })
    vi.mocked(supabase).from = from

    const phenomenon = await createPhenomenon({ planId: 'p1', kind: 'spire-vortex', x: 1, y: 2 })

    expect(from).toHaveBeenCalledWith('phenomenon')
    expect(chain.insert).toHaveBeenCalledWith({ plan_id: 'p1', kind: 'spire-vortex', x: 1, y: 2 })
    expect(phenomenon.kind).toBe('spire-vortex')
  })

  it('throws a descriptive French error when creation fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(
      createPhenomenon({ planId: 'p1', kind: 'point-cosmique', x: 0, y: 0 })
    ).rejects.toThrow("Impossible d'enregistrer le phénomène : network down")
  })

  it('lists phenomena scoped to a plan', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [{ id: 'ph1', plan_id: 'p1', kind: 'tube-magique', x: 0, y: 0, created_at: '2026-07-21T10:00:00Z' }],
      error: null,
    })
    vi.mocked(supabase).from = from

    const phenomena = await listPhenomenaForPlan('p1')

    expect(chain.eq).toHaveBeenCalledWith('plan_id', 'p1')
    expect(phenomena).toHaveLength(1)
    expect(phenomena[0].kind).toBe('tube-magique')
  })

  it('deletes a phenomenon', async () => {
    const { from, chain } = createSupabaseChainMock({ data: null, error: null })
    vi.mocked(supabase).from = from

    await deletePhenomenon('ph1')

    expect(from).toHaveBeenCalledWith('phenomenon')
    expect(chain.eq).toHaveBeenCalledWith('id', 'ph1')
  })

  it('throws a descriptive French error when deletion fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(deletePhenomenon('ph1')).rejects.toThrow(
      'Impossible de supprimer le phénomène : network down'
    )
  })
})
