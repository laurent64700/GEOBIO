import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

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
const PLAN_ID_STORES: StoreName[] = [
  'felt_point',
  'felt_segment',
  'phenomenon',
  'context_object',
  'freeform_network',
  'grid_instance',
]

interface GeobioOfflineDB extends DBSchema {
  [key: string]: { key: string | number; value: unknown }
}

const DB_NAME = 'geobio-offline'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<GeobioOfflineDB>> | null = null

export function getDB(): Promise<IDBPDatabase<GeobioOfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GeobioOfflineDB>(DB_NAME, DB_VERSION, {
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
