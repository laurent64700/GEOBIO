import { describe, it, expect, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { openDB } from 'idb'

describe('getDB — migration from v1', () => {
  it('upgrades an existing v1 database without throwing, adding action_history', async () => {
    // Recreates exactly what today's (pre-chantier) upgrade() does, so this
    // test simulates a real existing user's already-open v1 database.
    const v1 = await openDB('geobio-offline', 1, {
      upgrade(db) {
        const planIdStores = [
          'felt_point', 'felt_segment', 'phenomenon',
          'context_object', 'freeform_network', 'grid_instance',
        ]
        for (const store of planIdStores) {
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
    v1.close()

    // Fresh module instance so db.ts's module-level `dbPromise` singleton
    // isn't left over from another test file.
    vi.resetModules()
    const { getDB, STORE_NAMES } = await import('./db')
    const db = await getDB()

    for (const store of STORE_NAMES) {
      expect(db.objectStoreNames.contains(store)).toBe(true)
    }
    const tx = db.transaction('action_history', 'readonly')
    expect(tx.store.indexNames.contains('plan_id')).toBe(true)
  })
})
