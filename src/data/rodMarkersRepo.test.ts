// src/data/rodMarkersRepo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRodMarker, listRodMarkers } from './rodMarkersRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('rodMarkersRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a rod marker mapping', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: { marker_id: 101, network_name: 'Hartmann', rod_number: 1 },
      error: null,
    })
    vi.mocked(supabase).from = from

    const marker = await createRodMarker({ markerId: 101, networkName: 'Hartmann', rodNumber: 1 })

    expect(from).toHaveBeenCalledWith('rod_marker')
    expect(chain.insert).toHaveBeenCalledWith({
      marker_id: 101, network_name: 'Hartmann', rod_number: 1,
    })
    expect(marker.networkName).toBe('Hartmann')
  })

  it('lists all rod markers', async () => {
    const { from } = createSupabaseChainMock({
      data: [
        { marker_id: 101, network_name: 'Hartmann', rod_number: 1 },
        { marker_id: 102, network_name: 'Hartmann', rod_number: 1 },
      ],
      error: null,
    })
    vi.mocked(supabase).from = from

    const markers = await listRodMarkers()
    expect(markers).toHaveLength(2)
    expect(markers[0].rodNumber).toBe(1)
  })
})
