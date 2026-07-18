// src/data/missionsRepo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMission, listMissions, setMissionOrigin, setGlobalAssessment, setSelectedParcels } from './missionsRepo'
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
        cause_architectural: null,
        cause_electromagnetique: null,
        cause_geobiologique: null,
        cause_paranormale: null,
        cause_autres: null,
        bovis_rate: null,
        parcel_refs: [],
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
      causeArchitectural: null,
      causeElectromagnetique: null,
      causeGeobiologique: null,
      causeParanormale: null,
      causeAutres: null,
      bovisRate: null,
      parcelRefs: [],
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
        { id: 'm2', address: 'B', mission_date: '2026-07-21', declination_deg: null, origin_lat: null, origin_lng: null, cause_architectural: null, cause_electromagnetique: null, cause_geobiologique: null, cause_paranormale: null, cause_autres: null, bovis_rate: null, parcel_refs: [] },
        { id: 'm1', address: 'A', mission_date: '2026-07-20', declination_deg: null, origin_lat: null, origin_lng: null, cause_architectural: null, cause_electromagnetique: null, cause_geobiologique: null, cause_paranormale: null, cause_autres: null, bovis_rate: null, parcel_refs: [] },
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
        cause_architectural: null,
        cause_electromagnetique: null,
        cause_geobiologique: null,
        cause_paranormale: null,
        cause_autres: null,
        bovis_rate: null,
        parcel_refs: [],
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

  it('sets the global assessment and maps it back', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'm1', address: 'A', mission_date: '2026-07-20', declination_deg: null,
        origin_lat: null, origin_lng: null,
        cause_architectural: 3, cause_electromagnetique: 6, cause_geobiologique: 8,
        cause_paranormale: 1, cause_autres: 0, bovis_rate: 9500, parcel_refs: [],
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const mission = await setGlobalAssessment('m1', {
      causeArchitectural: 3, causeElectromagnetique: 6, causeGeobiologique: 8,
      causeParanormale: 1, causeAutres: 0, bovisRate: 9500,
    })

    expect(from).toHaveBeenCalledWith('mission')
    expect(chain.update).toHaveBeenCalledWith({
      cause_architectural: 3,
      cause_electromagnetique: 6,
      cause_geobiologique: 8,
      cause_paranormale: 1,
      cause_autres: 0,
      bovis_rate: 9500,
    })
    expect(chain.eq).toHaveBeenCalledWith('id', 'm1')
    expect(mission.bovisRate).toBe(9500)
    expect(mission.causeGeobiologique).toBe(8)
  })

  it('throws a descriptive French error when the global assessment update fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(
      setGlobalAssessment('m1', {
        causeArchitectural: 3, causeElectromagnetique: 6, causeGeobiologique: 8,
        causeParanormale: 1, causeAutres: 0, bovisRate: 9500,
      })
    ).rejects.toThrow("Impossible d'enregistrer les mesures globales : network down")
  })

  it('sets the selected parcels and maps them back', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'm1', address: 'A', mission_date: '2026-07-20', declination_deg: null,
        origin_lat: null, origin_lng: null,
        cause_architectural: null, cause_electromagnetique: null, cause_geobiologique: null,
        cause_paranormale: null, cause_autres: null, bovis_rate: null,
        parcel_refs: ['AB1167', 'AB1168'],
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const mission = await setSelectedParcels('m1', ['AB1167', 'AB1168'])

    expect(from).toHaveBeenCalledWith('mission')
    expect(chain.update).toHaveBeenCalledWith({ parcel_refs: ['AB1167', 'AB1168'] })
    expect(chain.eq).toHaveBeenCalledWith('id', 'm1')
    expect(mission.parcelRefs).toEqual(['AB1167', 'AB1168'])
  })

  it('throws a descriptive French error when setting selected parcels fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(setSelectedParcels('m1', ['AB1167'])).rejects.toThrow(
      "Impossible d'enregistrer les parcelles sélectionnées : network down"
    )
  })
})
