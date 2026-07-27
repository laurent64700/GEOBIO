import { describe, it, expect } from 'vitest'
import { CONTEXT_OBJECT_KINDS, contextObjectKindInfo } from './contextObjectKinds'

describe('CONTEXT_OBJECT_KINDS', () => {
  it('has both an interieur and an exterieur category', () => {
    const categories = new Set(CONTEXT_OBJECT_KINDS.map((k) => k.category))
    expect(categories).toEqual(new Set(['interieur', 'exterieur']))
  })

  it('gives every kind a non-empty label and a real SVG markup string', () => {
    for (const info of CONTEXT_OBJECT_KINDS) {
      expect(info.label.length).toBeGreaterThan(0)
      expect(info.svg).toContain('<svg')
      expect(info.svg).toContain('currentColor')
    }
  })

  it('has no duplicate kinds', () => {
    const kinds = CONTEXT_OBJECT_KINDS.map((k) => k.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
  })
})

describe('contextObjectKindInfo', () => {
  it('looks up a known kind', () => {
    expect(contextObjectKindInfo('canape').label).toBe('Canapé')
  })

  it('throws a descriptive error for an unknown kind', () => {
    // @ts-expect-error deliberately invalid kind, to test the runtime guard
    expect(() => contextObjectKindInfo('inconnu')).toThrow(/inconnu/)
  })
})
