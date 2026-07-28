import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getCurrentSession, setCurrentSession } from './currentSession'
import { getDB } from './db'
import type { Mission, Plan } from '../domain/types'

const mission: Mission = {
  id: 'm1', address: 'x', missionDate: '2026-07-27', declinationDeg: null,
  originLat: 48.85, originLng: 2.35, causeArchitectural: null, causeElectromagnetique: null,
  causeGeobiologique: null, causeParanormale: null, causeAutres: null, bovisRate: 5000,
  parcelRefs: [], buildingFootprint: null,
}
const exteriorPlan: Plan = { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null }

describe('currentSession', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('current_session')
  })

  it('returns null when nothing has been stored yet', async () => {
    expect(await getCurrentSession()).toBeNull()
  })

  it('stores and retrieves the mission + exterior plan pair', async () => {
    await setCurrentSession(mission, exteriorPlan)

    const session = await getCurrentSession()
    expect(session).toEqual({ mission, exteriorPlan })
  })

  it('overwrites the previous session when called again (single-entry store)', async () => {
    await setCurrentSession(mission, exteriorPlan)
    const otherMission = { ...mission, id: 'm2' }
    await setCurrentSession(otherMission, exteriorPlan)

    const session = await getCurrentSession()
    expect(session?.mission.id).toBe('m2')
  })
})
