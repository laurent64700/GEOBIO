import { describe, it, expect } from 'vitest'
import { SupabaseQueryError } from './supabaseQueryError'

describe('SupabaseQueryError', () => {
  it('is a real Error subclass, distinguishable via instanceof', () => {
    const err = new SupabaseQueryError('Impossible de charger les gabarits de grille : boom')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(SupabaseQueryError)
    expect(err.message).toBe('Impossible de charger les gabarits de grille : boom')
  })

  it('is NOT what a plain network failure (TypeError) is', () => {
    const networkFailure = new TypeError('Failed to fetch')
    expect(networkFailure).not.toBeInstanceOf(SupabaseQueryError)
  })
})
