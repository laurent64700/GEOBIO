// src/data/missionPhotosRepo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addMissionPhoto, listMissionPhotos, setPhotoCalibration } from './missionPhotosRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}))

const FIXED_UUID = '11111111-1111-1111-1111-111111111111'

describe('missionPhotosRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(FIXED_UUID)
  })

  it('uploads the file under a random-uuid path (not the original filename) and records it against the mission', async () => {
    const path = `m1/${FIXED_UUID}.jpg`
    const upload = vi.fn().mockResolvedValue({ data: { path }, error: null })
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: `https://xxx.supabase.co/storage/v1/object/sign/mission-photos/${path}?token=abc` },
      error: null,
    })
    vi.mocked(supabase.storage.from).mockReturnValue({ upload, createSignedUrl } as any)

    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'mp1',
        mission_id: 'm1',
        image_url: `https://xxx.supabase.co/storage/v1/object/sign/mission-photos/${path}?token=abc`,
        calibration: null,
        created_at: '2026-07-16T10:00:00Z',
      },
      error: null,
    })
    vi.mocked(supabase.from).mockImplementation(from)

    // French filename with spaces/accents, as commonly uploaded from a phone —
    // must NOT end up in the storage path (see planImageStorage.ts's rationale).
    const file = new File(['x'], 'Photo été 2026.jpg', { type: 'image/jpeg' })
    const photo = await addMissionPhoto('m1', file)

    expect(supabase.storage.from).toHaveBeenCalledWith('mission-photos')
    expect(upload).toHaveBeenCalledWith(path, file, { upsert: false })
    expect(createSignedUrl).toHaveBeenCalledWith(path, 60 * 60 * 24 * 365)
    expect(chain.insert).toHaveBeenCalledWith({
      mission_id: 'm1',
      image_url: `https://xxx.supabase.co/storage/v1/object/sign/mission-photos/${path}?token=abc`,
    })
    expect(photo.imageUrl).toContain('mission-photos')
  })

  it('lists photos scoped to a mission', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [
        { id: 'mp1', mission_id: 'm1', image_url: 'https://x/a.jpg', calibration: null, created_at: '2026-07-16T10:00:00Z' },
      ],
      error: null,
    })
    vi.mocked(supabase.from).mockImplementation(from)

    const photos = await listMissionPhotos('m1')

    expect(chain.eq).toHaveBeenCalledWith('mission_id', 'm1')
    expect(photos).toHaveLength(1)
  })

  it("sets a photo's calibration transform", async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'mp1', mission_id: 'm1', image_url: 'https://x/a.jpg',
        calibration: { a: 1, b: 0, c: 0, d: 1, e: 5, f: -3 },
        created_at: '2026-07-16T10:00:00Z',
      },
      error: null,
    })
    vi.mocked(supabase.from).mockImplementation(from)

    const photo = await setPhotoCalibration('mp1', { a: 1, b: 0, c: 0, d: 1, e: 5, f: -3 })

    expect(chain.update).toHaveBeenCalledWith({
      calibration: { a: 1, b: 0, c: 0, d: 1, e: 5, f: -3 },
    })
    expect(chain.eq).toHaveBeenCalledWith('id', 'mp1')
    expect(photo.calibration).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 5, f: -3 })
  })

  it('throws a descriptive French error when the upload fails', async () => {
    const upload = vi.fn().mockResolvedValue({ data: null, error: { message: 'quota exceeded' } })
    vi.mocked(supabase.storage.from).mockReturnValue({ upload } as any)

    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    await expect(addMissionPhoto('m1', file)).rejects.toThrow(
      "Impossible d'envoyer la photo : quota exceeded"
    )
  })

  it('throws a descriptive French error when signing the URL fails', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: `m1/${FIXED_UUID}.jpg` }, error: null })
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
    vi.mocked(supabase.storage.from).mockReturnValue({ upload, createSignedUrl } as any)

    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    await expect(addMissionPhoto('m1', file)).rejects.toThrow(
      "Impossible de générer le lien de la photo : not found"
    )
  })
})
