// src/data/plansRepo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPlan, listPlansForMission } from './plansRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('plansRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates an exterior plan with no image/calibration', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: { id: 'p1', mission_id: 'm1', kind: 'exterieur', image_url: null, calibration: null },
      error: null,
    })
    vi.mocked(supabase).from = from

    const plan = await createPlan({ missionId: 'm1', kind: 'exterieur' })

    expect(from).toHaveBeenCalledWith('plan')
    expect(chain.insert).toHaveBeenCalledWith({
      mission_id: 'm1',
      kind: 'exterieur',
      image_url: null,
      calibration: null,
    })
    expect(plan).toEqual({ id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null })
  })

  it('throws a descriptive French error when creation fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(createPlan({ missionId: 'm1', kind: 'exterieur' })).rejects.toThrow(
      'Impossible de créer le plan : network down'
    )
  })

  it('lists plans scoped to a mission', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [{ id: 'p1', mission_id: 'm1', kind: 'exterieur', image_url: null, calibration: null }],
      error: null,
    })
    vi.mocked(supabase).from = from

    const plans = await listPlansForMission('m1')

    expect(chain.eq).toHaveBeenCalledWith('mission_id', 'm1')
    expect(plans).toHaveLength(1)
  })
})
