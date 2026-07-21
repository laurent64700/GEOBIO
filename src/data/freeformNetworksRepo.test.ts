import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFreeformNetwork, listFreeformNetworksForPlan } from './freeformNetworksRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('freeformNetworksRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a freeform network with metadata', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'fn1', plan_id: 'p1', kind: 'eau',
        points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        current_bearing_deg: 45, depth_m: 2.5, flow_rate: 'faible',
        created_at: '2026-07-21T10:00:00Z',
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const network = await createFreeformNetwork({
      planId: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      currentBearingDeg: 45, depthM: 2.5, flowRate: 'faible',
    })

    expect(from).toHaveBeenCalledWith('freeform_network')
    expect(chain.insert).toHaveBeenCalledWith({
      plan_id: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      current_bearing_deg: 45, depth_m: 2.5, flow_rate: 'faible',
    })
    expect(network.currentBearingDeg).toBe(45)
    expect(network.points).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }])
  })

  it('creates a freeform network with all metadata fields null', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'fn1', plan_id: 'p1', kind: 'faille', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        current_bearing_deg: null, depth_m: null, flow_rate: null,
        created_at: '2026-07-21T10:00:00Z',
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const network = await createFreeformNetwork({
      planId: 'p1', kind: 'faille', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      currentBearingDeg: null, depthM: null, flowRate: null,
    })

    expect(chain.insert).toHaveBeenCalledWith({
      plan_id: 'p1', kind: 'faille', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      current_bearing_deg: null, depth_m: null, flow_rate: null,
    })
    expect(network.depthM).toBeNull()
  })

  it('throws a descriptive French error when creation fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(
      createFreeformNetwork({ planId: 'p1', kind: 'eau', points: [], currentBearingDeg: null, depthM: null, flowRate: null })
    ).rejects.toThrow("Impossible d'enregistrer le tracé : network down")
  })

  it('lists freeform networks scoped to a plan', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [{
        id: 'fn1', plan_id: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }],
        current_bearing_deg: null, depth_m: null, flow_rate: null, created_at: '2026-07-21T10:00:00Z',
      }],
      error: null,
    })
    vi.mocked(supabase).from = from

    const networks = await listFreeformNetworksForPlan('p1')

    expect(chain.eq).toHaveBeenCalledWith('plan_id', 'p1')
    expect(networks).toHaveLength(1)
    expect(networks[0].kind).toBe('eau')
  })

  it('throws a descriptive French error when listing fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(listFreeformNetworksForPlan('p1')).rejects.toThrow(
      'Impossible de charger les tracés : network down'
    )
  })
})
