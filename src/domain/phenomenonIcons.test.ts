import { describe, it, expect } from 'vitest'
import { PHENOMENON_ICONS } from './phenomenonIcons'
import type { PhenomenonKind } from './types'

const ALL_KINDS: PhenomenonKind[] = [
  'cheminee-1', 'cheminee-2', 'cheminee-3', 'cheminee-4',
  'spire-vortex', 'point-cosmique', 'carre-magique', 'tube-magique',
]

describe('PHENOMENON_ICONS', () => {
  it('has an entry with real SVG markup for every phenomenon kind', () => {
    for (const kind of ALL_KINDS) {
      expect(PHENOMENON_ICONS[kind].svg).toContain('<svg')
    }
  })

  it('gives each of the 4 cheminee kinds a distinct badge, sharing the same icon', () => {
    expect(PHENOMENON_ICONS['cheminee-1'].badge).toBe('1')
    expect(PHENOMENON_ICONS['cheminee-2'].badge).toBe('2')
    expect(PHENOMENON_ICONS['cheminee-3'].badge).toBe('3')
    expect(PHENOMENON_ICONS['cheminee-4'].badge).toBe('4')
    expect(PHENOMENON_ICONS['cheminee-1'].svg).toBe(PHENOMENON_ICONS['cheminee-4'].svg)
  })

  it('has no badge for the non-cheminee kinds (only one variant each)', () => {
    expect(PHENOMENON_ICONS['spire-vortex'].badge).toBeUndefined()
    expect(PHENOMENON_ICONS['point-cosmique'].badge).toBeUndefined()
    expect(PHENOMENON_ICONS['carre-magique'].badge).toBeUndefined()
    expect(PHENOMENON_ICONS['tube-magique'].badge).toBeUndefined()
  })
})
