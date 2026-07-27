import { openDB, type IDBPDatabase } from 'idb'

// Keep in sync with the createObjectStore calls in getDB()'s upgrade() below —
// this list and that imperative code are two hand-synced sources of truth.
export const STORE_NAMES = [
  'grid_template',
  'grid_instance',
  'grid_line',
  'felt_point',
  'felt_segment',
  'phenomenon',
  'context_object',
  'freeform_network',
  'plan',
  'current_session',
  'pending_mutations',
] as const

export type StoreName = (typeof STORE_NAMES)[number]

// Object stores indexed by plan_id (most terrain-phase data — see spec §4.2).
export const PLAN_ID_STORES = [
  'felt_point',
  'felt_segment',
  'phenomenon',
  'context_object',
  'freeform_network',
  'grid_instance',
] as const satisfies readonly StoreName[]

export type PlanIdStoreName = (typeof PLAN_ID_STORES)[number]

const DB_NAME = 'geobio-offline'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const store of PLAN_ID_STORES) {
          const os = db.createObjectStore(store, { keyPath: 'id' })
          os.createIndex('plan_id', 'planId')
        }
        db.createObjectStore('grid_template', { keyPath: 'id' })
        const lineStore = db.createObjectStore('grid_line', { keyPath: 'id' })
        lineStore.createIndex('grid_instance_id', 'gridInstanceId')
        const planStore = db.createObjectStore('plan', { keyPath: 'id' })
        planStore.createIndex('mission_id', 'missionId')
        db.createObjectStore('current_session')
        db.createObjectStore('pending_mutations', { keyPath: 'id', autoIncrement: true })
      },
    })
  }
  return dbPromise
}
