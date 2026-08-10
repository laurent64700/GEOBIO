// src/data/missionsRepo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMission, listMissions, setMissionOrigin, setGlobalAssessment, setSelectedParcels, setBuildingFootprint, duplicateMission, deleteMission } from './missionsRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'
import type { Mission } from '../domain/types'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn(), storage: { from: vi.fn() } } }))

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
        building_footprint: null,
        selected_parcels_geometry: null,
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
      buildingFootprint: null,
      selectedParcelsGeometry: null,
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
        { id: 'm2', address: 'B', mission_date: '2026-07-21', declination_deg: null, origin_lat: null, origin_lng: null, cause_architectural: null, cause_electromagnetique: null, cause_geobiologique: null, cause_paranormale: null, cause_autres: null, bovis_rate: null, parcel_refs: [], building_footprint: null },
        { id: 'm1', address: 'A', mission_date: '2026-07-20', declination_deg: null, origin_lat: null, origin_lng: null, cause_architectural: null, cause_electromagnetique: null, cause_geobiologique: null, cause_paranormale: null, cause_autres: null, bovis_rate: null, parcel_refs: [], building_footprint: null },
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
        building_footprint: null,
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
        building_footprint: null,
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
        building_footprint: null,
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

  it('sets the building footprint and maps it back', async () => {
    const footprint = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
    ]
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'm1', address: 'A', mission_date: '2026-07-20', declination_deg: null,
        origin_lat: null, origin_lng: null,
        cause_architectural: null, cause_electromagnetique: null, cause_geobiologique: null,
        cause_paranormale: null, cause_autres: null, bovis_rate: null, parcel_refs: [],
        building_footprint: footprint,
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const mission = await setBuildingFootprint('m1', footprint)

    expect(from).toHaveBeenCalledWith('mission')
    expect(chain.eq).toHaveBeenCalledWith('id', 'm1')
    expect(chain.update).toHaveBeenCalledWith({ building_footprint: footprint })
    expect(mission.buildingFootprint).toEqual(footprint)
  })

  it('throws a descriptive French error when setting the building footprint fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(setBuildingFootprint('m1', [])).rejects.toThrow(
      "Impossible d'enregistrer le contour du bâtiment : network down"
    )
  })

  describe('duplicateMission', () => {
    it('creates a new mission copying address/declination/parcels/footprint (NOT missionDate — defaults to today), and a fresh empty exterior plan', async () => {
      const today = new Date().toISOString().slice(0, 10)
      const source: Mission = {
        id: 'm1', address: '12 rue des Lilas', missionDate: '2026-01-01', // deliberately NOT today, to prove it's not copied
        declinationDeg: 1.5, originLat: 48.85, originLng: 2.35,
        causeArchitectural: 3, causeElectromagnetique: 2, causeGeobiologique: 7,
        causeParanormale: 0, causeAutres: 0, bovisRate: 8000,
        parcelRefs: ['ABC-123'], buildingFootprint: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
        selectedParcelsGeometry: null,
      }
      const baseRow = {
        id: 'm2', address: '12 rue des Lilas', mission_date: today, declination_deg: 1.5,
        origin_lat: null, origin_lng: null, cause_architectural: null, cause_electromagnetique: null,
        cause_geobiologique: null, cause_paranormale: null, cause_autres: null, bovis_rate: null,
        parcel_refs: [] as string[], building_footprint: null as null | typeof source.buildingFootprint,
      }
      // Only `chain` is used from each instance — `createSupabaseChainMock` also
      // returns its own standalone `from` mock, but it's discarded here: all 4
      // calls are dispatched through ONE shared `supabase.from` mock below
      // instead (via chained `mockReturnValueOnce`), not through 4 independent
      // `from` mocks.
      const { chain: chainInsertMission } = createSupabaseChainMock({ data: baseRow, error: null })
      const { chain: chainUpdateParcels } =
        createSupabaseChainMock({ data: { ...baseRow, parcel_refs: ['ABC-123'] }, error: null })
      const { chain: chainUpdateFootprint } = createSupabaseChainMock({
        data: { ...baseRow, parcel_refs: ['ABC-123'], building_footprint: source.buildingFootprint },
        error: null,
      })
      const { chain: chainInsertPlan } = createSupabaseChainMock({
        data: { id: 'plan1', mission_id: 'm2', kind: 'exterieur', image_url: null, calibration: null },
        error: null,
      })
      vi.mocked(supabase).from = vi.fn()
        .mockReturnValueOnce(chainInsertMission)
        .mockReturnValueOnce(chainUpdateParcels)
        .mockReturnValueOnce(chainUpdateFootprint)
        .mockReturnValueOnce(chainInsertPlan)

      const result = await duplicateMission(source)

      expect(result.mission.address).toBe('12 rue des Lilas')
      expect(result.mission.id).toBe('m2')
      expect(result.mission.missionDate).toBe(today) // today, NOT source.missionDate ('2026-01-01')
      expect(result.mission.originLat).toBeNull() // not copied
      expect(result.mission.causeGeobiologique).toBeNull() // not copied
      expect(result.mission.parcelRefs).toEqual(['ABC-123']) // copied
      expect(result.mission.buildingFootprint).toEqual(source.buildingFootprint) // copied
      expect(result.exteriorPlan.kind).toBe('exterieur')
      expect(result.exteriorPlan.missionId).toBe('m2')
    })

    it('skips setSelectedParcels/setBuildingFootprint entirely when the source has neither (only 2 supabase calls)', async () => {
      const source: Mission = {
        id: 'm1', address: 'test diag', missionDate: '2026-08-06', declinationDeg: null,
        originLat: null, originLng: null, causeArchitectural: null, causeElectromagnetique: null,
        causeGeobiologique: null, causeParanormale: null, causeAutres: null, bovisRate: null,
        parcelRefs: [], buildingFootprint: null,
        selectedParcelsGeometry: null,
      }
      const { chain: chainInsertMission } = createSupabaseChainMock({
        data: { id: 'm2', address: 'test diag', mission_date: '2026-08-06', declination_deg: null,
          origin_lat: null, origin_lng: null, cause_architectural: null, cause_electromagnetique: null,
          cause_geobiologique: null, cause_paranormale: null, cause_autres: null, bovis_rate: null,
          parcel_refs: [], building_footprint: null },
        error: null,
      })
      const { chain: chainInsertPlan } = createSupabaseChainMock({
        data: { id: 'plan1', mission_id: 'm2', kind: 'exterieur', image_url: null, calibration: null },
        error: null,
      })
      const fromMock = vi.fn().mockReturnValueOnce(chainInsertMission).mockReturnValueOnce(chainInsertPlan)
      vi.mocked(supabase).from = fromMock

      await duplicateMission(source)

      expect(fromMock).toHaveBeenCalledTimes(2) // mission insert + plan insert only — no update calls
    })
  })

  describe('deleteMission', () => {
    it('deletes the mission row, then best-effort cleans up both Storage buckets', async () => {
      const { from, chain } = createSupabaseChainMock({ data: null, error: null })
      vi.mocked(supabase).from = from

      const listPhotos = vi.fn().mockResolvedValue({
        data: [{ name: 'abc-123.jpg' }, { name: 'def-456.jpg' }],
        error: null,
      })
      const removePhotos = vi.fn().mockResolvedValue({ data: null, error: null })
      const listPlans = vi.fn().mockResolvedValue({ data: [{ name: 'interior-plan.jpg' }], error: null })
      const removePlans = vi.fn().mockResolvedValue({ data: null, error: null })
      vi.mocked(supabase.storage.from).mockImplementation((bucket: string) => {
        if (bucket === 'mission-photos') return { list: listPhotos, remove: removePhotos } as any
        if (bucket === 'plans') return { list: listPlans, remove: removePlans } as any
        throw new Error(`unexpected bucket ${bucket}`)
      })

      await deleteMission('m1')

      expect(chain.delete).toHaveBeenCalled()
      expect(chain.eq).toHaveBeenCalledWith('id', 'm1')
      expect(listPhotos).toHaveBeenCalledWith('m1')
      expect(removePhotos).toHaveBeenCalledWith(['m1/abc-123.jpg', 'm1/def-456.jpg'])
      expect(listPlans).toHaveBeenCalledWith('m1')
      expect(removePlans).toHaveBeenCalledWith(['m1/interior-plan.jpg'])
    })

    it('propagates an error from the DB delete itself, without attempting Storage cleanup', async () => {
      const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
      vi.mocked(supabase).from = from
      const listPhotos = vi.fn()
      vi.mocked(supabase.storage.from).mockReturnValue({ list: listPhotos, remove: vi.fn() } as any)

      await expect(deleteMission('m1')).rejects.toThrow('network down')
      expect(listPhotos).not.toHaveBeenCalled()
    })

    it('does not throw when Storage cleanup itself fails (best-effort, mission is already deleted)', async () => {
      const { from } = createSupabaseChainMock({ data: null, error: null })
      vi.mocked(supabase).from = from
      // Must actually REJECT, not just resolve with an error-shaped payload —
      // cleanUpMissionStorage only destructures `data` from list()'s result
      // and never reads `error`, so a resolved `{ data: null, error: {...} }`
      // silently takes the ordinary "no files" `continue` path and never
      // reaches the try/catch this test claims to cover. A genuine rejection
      // is the only way to prove the catch in deleteMission actually swallows
      // a real Storage failure, per design spec §5bis/§6.
      vi.mocked(supabase.storage.from).mockReturnValue({
        list: vi.fn().mockRejectedValue(new Error('storage down')),
        remove: vi.fn(),
      } as any)

      await expect(deleteMission('m1')).resolves.toBeUndefined()
    })

    it('skips remove() entirely when a bucket has no files for this mission', async () => {
      const { from } = createSupabaseChainMock({ data: null, error: null })
      vi.mocked(supabase).from = from
      const remove = vi.fn()
      vi.mocked(supabase.storage.from).mockReturnValue({
        list: vi.fn().mockResolvedValue({ data: [], error: null }),
        remove,
      } as any)

      await deleteMission('m1')

      expect(remove).not.toHaveBeenCalled()
    })
  })
})
