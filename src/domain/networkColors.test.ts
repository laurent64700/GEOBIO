import { describe, it, expect } from 'vitest'
import { resolveNetworkColor, NON_GRID_NETWORK_COLORS } from './networkColors'
import type { GridInstance, GridTemplate } from './types'

function makeTemplate(name: string, color: string): GridTemplate {
  return {
    id: `t-${name}`, name, spacingXM: 1, spacingYM: 1, angleTrueNorthDeg: 0,
    originOffsetX: 0, originOffsetY: 0, color, vibratoryBase: 7,
  }
}

function makeInstance(name: string, color: string): GridInstance {
  return { id: `gi-${name}`, planId: 'p1', templateSnapshot: makeTemplate(name, color), originX: 0, originY: 0 }
}

describe('resolveNetworkColor', () => {
  it('prefers an active GridInstance color over the GridTemplate color', () => {
    const instances = [makeInstance('Hartmann', '#custom-override')]
    const templates = [makeTemplate('Hartmann', '#d32f2f')]
    expect(resolveNetworkColor('Hartmann', instances, templates)).toBe('#custom-override')
  })

  it('falls back to the GridTemplate color when no instance is active on this plan', () => {
    const templates = [makeTemplate('Peyré', '#8e5fb3')]
    expect(resolveNetworkColor('Peyré', [], templates)).toBe('#8e5fb3')
  })

  it('falls back to the free-standing table for non-grid categories', () => {
    expect(resolveNetworkColor('Eau', [], [])).toBe(NON_GRID_NETWORK_COLORS.Eau)
    expect(resolveNetworkColor('Failles', [], [])).toBe(NON_GRID_NETWORK_COLORS.Failles)
  })

  it('falls back to grey for a genuinely unrecognized network name', () => {
    expect(resolveNetworkColor('Inconnu', [], [])).toBe('#888888')
  })

  it('falls back to grey rather than exposing a prototype property for a name like "constructor"', () => {
    expect(resolveNetworkColor('constructor', [], [])).toBe('#888888')
  })
})
