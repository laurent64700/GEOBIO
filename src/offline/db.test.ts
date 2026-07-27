import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDB, STORE_NAMES } from './db'

describe('getDB', () => {
  it('opens the database with every expected object store', async () => {
    const db = await getDB()
    for (const store of STORE_NAMES) {
      expect(db.objectStoreNames.contains(store)).toBe(true)
    }
  })

  it('creates a plan_id index on grid_template siblings but not on grid_template itself', async () => {
    const db = await getDB()
    const tx = db.transaction('felt_point', 'readonly')
    expect(tx.store.indexNames.contains('plan_id')).toBe(true)
    const templateTx = db.transaction('grid_template', 'readonly')
    expect(templateTx.store.indexNames.contains('plan_id')).toBe(false)
  })

  it('indexes grid_line by grid_instance_id, not plan_id', async () => {
    const db = await getDB()
    const tx = db.transaction('grid_line', 'readonly')
    expect(tx.store.indexNames.contains('grid_instance_id')).toBe(true)
  })
})
