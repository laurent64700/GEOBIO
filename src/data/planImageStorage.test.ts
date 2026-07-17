// src/data/planImageStorage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { uploadPlanImage } from './planImageStorage'
import { supabase } from '../lib/supabaseClient'

vi.mock('../lib/supabaseClient', () => ({
  supabase: { storage: { from: vi.fn() } },
}))

describe('uploadPlanImage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uploads the file to the plans bucket and returns its signed URL', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'm1/plan.jpg' }, error: null })
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://xxx.supabase.co/storage/v1/object/sign/plans/m1/plan.jpg?token=abc' },
      error: null,
    })
    vi.mocked(supabase.storage.from).mockReturnValue({ upload, createSignedUrl } as any)

    const file = new File(['fake-image-bytes'], 'plan.jpg', { type: 'image/jpeg' })
    const url = await uploadPlanImage('m1', file)

    expect(supabase.storage.from).toHaveBeenCalledWith('plans')
    expect(upload).toHaveBeenCalledWith('m1/plan.jpg', file, { upsert: true })
    expect(createSignedUrl).toHaveBeenCalledWith('m1/plan.jpg', 60 * 60 * 24 * 365)
    expect(url).toBe('https://xxx.supabase.co/storage/v1/object/sign/plans/m1/plan.jpg?token=abc')
  })

  it('throws a descriptive French error when the upload fails', async () => {
    const upload = vi.fn().mockResolvedValue({ data: null, error: { message: 'quota exceeded' } })
    vi.mocked(supabase.storage.from).mockReturnValue({ upload } as any)

    const file = new File(['x'], 'plan.jpg', { type: 'image/jpeg' })
    await expect(uploadPlanImage('m1', file)).rejects.toThrow(
      "Impossible d'envoyer l'image du plan : quota exceeded"
    )
  })

  it('throws a descriptive French error when signing the URL fails', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'm1/plan.jpg' }, error: null })
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
    vi.mocked(supabase.storage.from).mockReturnValue({ upload, createSignedUrl } as any)

    const file = new File(['x'], 'plan.jpg', { type: 'image/jpeg' })
    await expect(uploadPlanImage('m1', file)).rejects.toThrow(
      "Impossible de générer le lien de l'image du plan : not found"
    )
  })
})
