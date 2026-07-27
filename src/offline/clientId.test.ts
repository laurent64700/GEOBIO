import { describe, it, expect } from 'vitest'
import { generateClientId } from './clientId'

describe('generateClientId', () => {
  it('returns a valid UUID', () => {
    const id = generateClientId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it('returns a different id on each call', () => {
    expect(generateClientId()).not.toBe(generateClientId())
  })
})
