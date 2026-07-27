import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isOnlineNow } from './connectivity'

describe('isOnlineNow', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('returns true when navigator.onLine is true and the network probe succeeds', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)

    expect(await isOnlineNow()).toBe(true)
  })

  it('returns false when navigator.onLine is false, without even probing the network', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    expect(await isOnlineNow()).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns false when navigator.onLine is true but the network probe fails (lying online state)', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    expect(await isOnlineNow()).toBe(false)
  })

  it('returns false when the network probe times out', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(fetch).mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('aborted')), 50))
    )

    expect(await isOnlineNow()).toBe(false)
  }, 2000)
})
