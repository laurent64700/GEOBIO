import { describe, it, expect } from 'vitest'
import 'fake-indexeddb/auto'
import { getDB, STORE_NAMES } from './db'

// Mirrors db.ts's PLAN_ID_STORES (not exported — kept as a literal list here
// so this test fails loudly if the two lists ever drift apart).
const PLAN_ID_STORES = [
  'felt_point',
  'felt_segment',
  'phenomenon',
  'context_object',
  'freeform_network',
  'grid_instance',
] as const

describe('getDB', () => {
  it('opens the database with every expected object store', async () => {
    const db = await getDB()
    for (const store of STORE_NAMES) {
      expect(db.objectStoreNames.contains(store)).toBe(true)
    }
  })

  it('creates a plan_id index on every PLAN_ID_STORES member but not on grid_template', async () => {
    const db = await getDB()
    for (const store of PLAN_ID_STORES) {
      const tx = db.transaction(store, 'readonly')
      expect(tx.store.indexNames.contains('plan_id')).toBe(true)
    }
    const templateTx = db.transaction('grid_template', 'readonly')
    expect(templateTx.store.indexNames.contains('plan_id')).toBe(false)
  })

  it('indexes grid_line by grid_instance_id, not plan_id', async () => {
    const db = await getDB()
    const tx = db.transaction('grid_line', 'readonly')
    expect(tx.store.indexNames.contains('grid_instance_id')).toBe(true)
    expect(tx.store.indexNames.contains('plan_id')).toBe(false)
  })

  it('indexes plan by mission_id', async () => {
    const db = await getDB()
    const tx = db.transaction('plan', 'readonly')
    expect(tx.store.indexNames.contains('mission_id')).toBe(true)
  })
})
