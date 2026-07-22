// src/pages/deriveResumePhase.test.ts
import { describe, it, expect, vi } from 'vitest'
import { deriveResumePhase } from './deriveResumePhase'
import * as plansRepo from '../data/plansRepo'
import type { Mission, Plan } from '../domain/types'

vi.mock('../data/plansRepo')

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'm1', address: 'Paris', missionDate: '2026-07-20', declinationDeg: null,
    originLat: null, originLng: null, causeArchitectural: null, causeElectromagnetique: null,
    causeGeobiologique: null, causeParanormale: null, causeAutres: null, bovisRate: null,
    parcelRefs: [], buildingFootprint: null,
    ...overrides,
  }
}

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null, ...overrides }
}

describe('deriveResumePhase', () => {
  it('retries creating the exterior plan when none exists (orphaned mission)', async () => {
    vi.mocked(plansRepo.listPlansForMission).mockResolvedValue([])
    vi.mocked(plansRepo.createPlan).mockResolvedValue(makePlan())

    const phase = await deriveResumePhase(makeMission())

    expect(plansRepo.createPlan).toHaveBeenCalledWith({ missionId: 'm1', kind: 'exterieur' })
    expect(phase.name).toBe('global-assessment')
  })

  it('resumes at global-assessment when the exterior plan exists but bovisRate is null', async () => {
    vi.mocked(plansRepo.listPlansForMission).mockResolvedValue([makePlan()])

    const phase = await deriveResumePhase(makeMission({ bovisRate: null }))

    expect(phase.name).toBe('global-assessment')
  })

  it('resumes at setting-origin when the bilan is filled but origin is not set', async () => {
    vi.mocked(plansRepo.listPlansForMission).mockResolvedValue([makePlan()])

    const phase = await deriveResumePhase(makeMission({ bovisRate: 8000, originLat: null, originLng: null }))

    expect(phase.name).toBe('setting-origin')
  })

  it('resumes at ready-no-interior when the origin is set', async () => {
    vi.mocked(plansRepo.listPlansForMission).mockResolvedValue([makePlan()])

    const phase = await deriveResumePhase(makeMission({ bovisRate: 8000, originLat: 48.85, originLng: 2.35 }))

    expect(phase.name).toBe('ready-no-interior')
  })

  it('filters listPlansForMission results to kind === "exterieur" (an interior plan may also exist)', async () => {
    vi.mocked(plansRepo.listPlansForMission).mockResolvedValue([
      makePlan({ id: 'interior', kind: 'interieur' }),
      makePlan({ id: 'exterior', kind: 'exterieur' }),
    ])

    const phase = await deriveResumePhase(makeMission({ bovisRate: 8000, originLat: 48.85, originLng: 2.35 }))

    expect(phase.name).toBe('ready-no-interior')
    if (phase.name === 'ready-no-interior') expect(phase.exteriorPlan.id).toBe('exterior')
  })
})
