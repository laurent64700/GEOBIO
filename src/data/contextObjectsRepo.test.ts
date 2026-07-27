import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createContextObject, deleteContextObject, listContextObjectsForPlan } from './contextObjectsRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('contextObjectsRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a context object', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: { id: 'co1', plan_id: 'p1', kind: 'arbre-chene', x: 1, y: 2, created_at: '2026-07-27T10:00:00Z' },
      error: null,
    })
    vi.mocked(supabase).from = from

    const obj = await createContextObject({ planId: 'p1', kind: 'arbre-chene', x: 1, y: 2 })

    expect(from).toHaveBeenCalledWith('context_object')
    expect(chain.insert).toHaveBeenCalledWith({ plan_id: 'p1', kind: 'arbre-chene', x: 1, y: 2 })
    expect(obj.kind).toBe('arbre-chene')
  })

  it('throws a descriptive French error when creation fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(
      createContextObject({ planId: 'p1', kind: 'canape', x: 0, y: 0 })
    ).rejects.toThrow("Impossible d'enregistrer l'objet de contexte : network down")
  })

  it('lists context objects scoped to a plan', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [{ id: 'co1', plan_id: 'p1', kind: 'puits', x: 0, y: 0, created_at: '2026-07-27T10:00:00Z' }],
      error: null,
    })
    vi.mocked(supabase).from = from

    const objects = await listContextObjectsForPlan('p1')

    expect(chain.eq).toHaveBeenCalledWith('plan_id', 'p1')
    expect(objects).toHaveLength(1)
    expect(objects[0].kind).toBe('puits')
  })

  it('deletes a context object', async () => {
    const { from, chain } = createSupabaseChainMock({ data: null, error: null })
    vi.mocked(supabase).from = from

    await deleteContextObject('co1')

    expect(from).toHaveBeenCalledWith('context_object')
    expect(chain.eq).toHaveBeenCalledWith('id', 'co1')
  })

  it('throws a descriptive French error when deletion fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(deleteContextObject('co1')).rejects.toThrow(
      "Impossible de supprimer l'objet de contexte : network down"
    )
  })
})
