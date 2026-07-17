// src/data/missionsRepo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMission, listMissions, setMissionOrigin } from './missionsRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('missionsRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a mission and maps the row to camelCase', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'm1',
        address: '12 rue des Lilas',
        mission_date: '2026-07-20',
        declination_deg: 1.5,
        origin_lat: null,
        origin_lng: null,
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const mission = await createMission({
      address: '12 rue des Lilas',
      missionDate: '2026-07-20',
      declinationDeg: 1.5,
    })

    expect(from).toHaveBeenCalledWith('mission')
    expect(chain.insert).toHaveBeenCalledWith({
      address: '12 rue des Lilas',
      mission_date: '2026-07-20',
      declination_deg: 1.5,
    })
    expect(mission).toEqual({
      id: 'm1',
      address: '12 rue des Lilas',
      missionDate: '2026-07-20',
      declinationDeg: 1.5,
      originLat: null,
      originLng: null,
    })
  })

  it('throws a descriptive French error when the insert fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(
      createMission({ address: 'x', missionDate: '2026-07-20' })
    ).rejects.toThrow('Impossible de créer la mission : network down')
  })

  it('lists missions ordered by most recent date first', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [
        { id: 'm2', address: 'B', mission_date: '2026-07-21', declination_deg: null, origin_lat: null, origin_lng: null },
        { id: 'm1', address: 'A', mission_date: '2026-07-20', declination_deg: null, origin_lat: null, origin_lng: null },
      ],
      error: null,
    })
    vi.mocked(supabase).from = from

    const missions = await listMissions()

    expect(chain.order).toHaveBeenCalledWith('mission_date', { ascending: false })
    expect(missions).toHaveLength(2)
    expect(missions[0].id).toBe('m2')
  })

  it('sets the mission origin and maps it back', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'm1',
        address: 'A',
        mission_date: '2026-07-20',
        declination_deg: null,
        origin_lat: 48.8566,
        origin_lng: 2.3522,
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const mission = await setMissionOrigin('m1', { lat: 48.8566, lng: 2.3522 })

    expect(from).toHaveBeenCalledWith('mission')
    expect(chain.eq).toHaveBeenCalledWith('id', 'm1')
    expect(mission.originLat).toBe(48.8566)
    expect(mission.originLng).toBe(2.3522)
  })
})
