import { describe, it, expect, vi, beforeEach } from 'vitest'
import { preloadPlanForOffline } from './preload'
import * as gridTemplatesRepo from '../data/gridTemplatesRepo'
import * as gridInstancesRepo from '../data/gridInstancesRepo'
import * as gridLinesRepo from '../data/gridLinesRepo'
import * as feltPointsRepo from '../data/feltPointsRepo'
import * as feltSegmentsRepo from '../data/feltSegmentsRepo'
import * as phenomenaRepo from '../data/phenomenaRepo'
import * as contextObjectsRepo from '../data/contextObjectsRepo'
import * as freeformNetworksRepo from '../data/freeformNetworksRepo'
import * as plansRepo from '../data/plansRepo'
import * as currentSession from './currentSession'
import type { Mission, Plan, GridInstance, GridTemplate } from '../domain/types'

vi.mock('../data/gridTemplatesRepo')
vi.mock('../data/gridInstancesRepo')
vi.mock('../data/gridLinesRepo')
vi.mock('../data/feltPointsRepo')
vi.mock('../data/feltSegmentsRepo')
vi.mock('../data/phenomenaRepo')
vi.mock('../data/contextObjectsRepo')
vi.mock('../data/freeformNetworksRepo')
vi.mock('../data/plansRepo')
vi.mock('./currentSession')

const mission: Mission = {
  id: 'm1', address: 'x', missionDate: '2026-07-27', declinationDeg: null,
  originLat: 48.85, originLng: 2.35, causeArchitectural: null, causeElectromagnetique: null,
  causeGeobiologique: null, causeParanormale: null, causeAutres: null, bovisRate: 5000,
  parcelRefs: [], buildingFootprint: null,
}

const exteriorPlan: Plan = { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null }

const templateSnapshot: GridTemplate = {
  id: 't1', name: 'Hartmann', spacingXM: 2, spacingYM: 2.5, angleTrueNorthDeg: 0,
  originOffsetX: 0, originOffsetY: 0, color: '#fff', vibratoryBase: 8,
}

const instances: GridInstance[] = [
  { id: 'gi1', planId: 'p1', templateSnapshot, originX: 0, originY: 0 },
  { id: 'gi2', planId: 'p1', templateSnapshot, originX: 1, originY: 1 },
]

describe('preloadPlanForOffline', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue(instances)
    vi.mocked(gridTemplatesRepo.listGridTemplates).mockResolvedValue([])
    vi.mocked(gridLinesRepo.listGridLinesForInstance).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(feltSegmentsRepo.listFeltSegmentsForPlan).mockResolvedValue([])
    vi.mocked(phenomenaRepo.listPhenomenaForPlan).mockResolvedValue([])
    vi.mocked(contextObjectsRepo.listContextObjectsForPlan).mockResolvedValue([])
    vi.mocked(freeformNetworksRepo.listFreeformNetworksForPlan).mockResolvedValue([])
    vi.mocked(plansRepo.listPlansForMission).mockResolvedValue([])
    vi.mocked(currentSession.setCurrentSession).mockResolvedValue(undefined)
  })

  it('primes every plan-scoped cache exactly once with the correct plan/mission id', async () => {
    await preloadPlanForOffline(mission, exteriorPlan)

    expect(gridInstancesRepo.listGridInstancesForPlan).toHaveBeenCalledTimes(1)
    expect(gridInstancesRepo.listGridInstancesForPlan).toHaveBeenCalledWith('p1')

    expect(gridTemplatesRepo.listGridTemplates).toHaveBeenCalledTimes(1)
    expect(gridTemplatesRepo.listGridTemplates).toHaveBeenCalledWith()

    expect(feltPointsRepo.listFeltPointsForPlan).toHaveBeenCalledTimes(1)
    expect(feltPointsRepo.listFeltPointsForPlan).toHaveBeenCalledWith('p1')

    expect(feltSegmentsRepo.listFeltSegmentsForPlan).toHaveBeenCalledTimes(1)
    expect(feltSegmentsRepo.listFeltSegmentsForPlan).toHaveBeenCalledWith('p1')

    expect(phenomenaRepo.listPhenomenaForPlan).toHaveBeenCalledTimes(1)
    expect(phenomenaRepo.listPhenomenaForPlan).toHaveBeenCalledWith('p1')

    expect(contextObjectsRepo.listContextObjectsForPlan).toHaveBeenCalledTimes(1)
    expect(contextObjectsRepo.listContextObjectsForPlan).toHaveBeenCalledWith('p1')

    expect(freeformNetworksRepo.listFreeformNetworksForPlan).toHaveBeenCalledTimes(1)
    expect(freeformNetworksRepo.listFreeformNetworksForPlan).toHaveBeenCalledWith('p1')

    expect(plansRepo.listPlansForMission).toHaveBeenCalledTimes(1)
    expect(plansRepo.listPlansForMission).toHaveBeenCalledWith('m1')
  })

  it('calls listGridLinesForInstance once per grid instance returned for the plan', async () => {
    await preloadPlanForOffline(mission, exteriorPlan)

    expect(gridLinesRepo.listGridLinesForInstance).toHaveBeenCalledTimes(2)
    expect(gridLinesRepo.listGridLinesForInstance).toHaveBeenCalledWith('gi1')
    expect(gridLinesRepo.listGridLinesForInstance).toHaveBeenCalledWith('gi2')
  })

  it('calls listGridLinesForInstance zero times when the plan has no grid instances', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])

    await preloadPlanForOffline(mission, exteriorPlan)

    expect(gridLinesRepo.listGridLinesForInstance).not.toHaveBeenCalled()
  })

  it('writes the current session exactly once with the mission and exterior plan', async () => {
    await preloadPlanForOffline(mission, exteriorPlan)

    expect(currentSession.setCurrentSession).toHaveBeenCalledTimes(1)
    expect(currentSession.setCurrentSession).toHaveBeenCalledWith(mission, exteriorPlan)
  })
})
