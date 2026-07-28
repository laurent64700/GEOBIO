import { getDB } from './db'
import type { Mission, Plan } from '../domain/types'

export interface CurrentSession {
  mission: Mission
  exteriorPlan: Plan
}

const SESSION_KEY = 'current'

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const db = await getDB()
  const session = await db.get('current_session', SESSION_KEY)
  return (session as CurrentSession | undefined) ?? null
}

export async function setCurrentSession(mission: Mission, exteriorPlan: Plan): Promise<void> {
  const db = await getDB()
  await db.put('current_session', { mission, exteriorPlan }, SESSION_KEY)
}
