// src/data/planImageStorage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { uploadPlanImage } from './planImageStorage'
import { supabase } from '../lib/supabaseClient'

vi.mock('../lib/supabaseClient', () => ({
  supabase: { storage: { from: vi.fn() } },
}))

describe('uploadPlanImage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uploads the file to the plans bucket and returns its public URL', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'm1/plan.jpg' }, error: null })
    const getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: 'https://xxx.supabase.co/storage/v1/object/public/plans/m1/plan.jpg' },
    })
    vi.mocked(supabase.storage.from).mockReturnValue({ upload, getPublicUrl } as any)

    const file = new File(['fake-image-bytes'], 'plan.jpg', { type: 'image/jpeg' })
    const url = await uploadPlanImage('m1', file)

    expect(supabase.storage.from).toHaveBeenCalledWith('plans')
    expect(upload).toHaveBeenCalledWith('m1/plan.jpg', file, { upsert: true })
    expect(url).toBe('https://xxx.supabase.co/storage/v1/object/public/plans/m1/plan.jpg')
  })

  it('throws a descriptive French error when the upload fails', async () => {
    const upload = vi.fn().mockResolvedValue({ data: null, error: { message: 'quota exceeded' } })
    vi.mocked(supabase.storage.from).mockReturnValue({ upload } as any)

    const file = new File(['x'], 'plan.jpg', { type: 'image/jpeg' })
    await expect(uploadPlanImage('m1', file)).rejects.toThrow(
      "Impossible d'envoyer l'image du plan : quota exceeded"
    )
  })
})
