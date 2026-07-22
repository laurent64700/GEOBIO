// src/data/geocodingService.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { geocodeAddress } from './geocodingService'

describe('geocodeAddress', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns lat/lng from the first BAN feature on a successful match', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ geometry: { coordinates: [2.3522, 48.8566] } }], // BAN returns [lng, lat]
      }),
    }))

    const result = await geocodeAddress('10 Rue de Rivoli, 75001 Paris')

    expect(result).toEqual({ lat: 48.8566, lng: 2.3522 })
  })

  it('returns null when the BAN response has no features (no match)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) }))
    expect(await geocodeAddress('adresse inexistante xyz')).toBeNull()
  })

  it('returns null (does not throw) on a network/API failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    expect(await geocodeAddress('10 Rue de Rivoli, 75001 Paris')).toBeNull()
  })
})
