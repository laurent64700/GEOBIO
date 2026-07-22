import { describe, it, expect } from 'vitest'
import { allowedBearingsForNetwork } from './networkBearings'

describe('allowedBearingsForNetwork', () => {
  it.each([
    ['Hartmann', [0, 90]],
    ['Palm', [0, 90]],
    ['Peyré', [0, 90]],
    ['Curry', [45, 135]],
    ['Wissmann', [45, 135]],
  ])('%s allows %j', (network, expected) => {
    expect(allowedBearingsForNetwork(network)).toEqual(expected)
  })

  it('returns null (all bearings allowed) for an unrecognized network name', () => {
    expect(allowedBearingsForNetwork('Réseau inconnu')).toBeNull()
  })

  it('returns null when no network is given', () => {
    expect(allowedBearingsForNetwork(null)).toBeNull()
  })
})
