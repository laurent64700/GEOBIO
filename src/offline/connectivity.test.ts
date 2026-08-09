import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isOnlineNow } from './connectivity'

describe('isOnlineNow', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

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

  it('probes the REST API path with the anon apikey header, not the bare project root domain', async () => {
    // The bare project root (e.g. https://xxx.supabase.co/, no path, no
    // apikey header) isn't the API surface the rest of the app actually
    // talks to (supabaseClient.ts always calls /rest/v1/... with apikey) —
    // and it doesn't send the same CORS headers as that real API surface.
    // Probing the root produced a false "offline" for Laurent on his own
    // real, connected device (field testing 08/2026: "indique hors ligne
    // alors que connecté"), blocking mission deletion with "Suppression
    // indisponible hors-ligne" even though every other network call in the
    // app worked fine at the same moment.
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)

    await isOnlineNow()

    const [calledUrl, calledOptions] = vi.mocked(fetch).mock.calls[0]
    expect(String(calledUrl)).toMatch(/\/rest\/v1\/?$/)
    expect((calledOptions as RequestInit).headers).toMatchObject({ apikey: expect.any(String) })
  })

  it('returns false when the network probe times out', async () => {
    vi.useFakeTimers()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(fetch).mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          const signal = (options as RequestInit)?.signal
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
    )

    const resultPromise = isOnlineNow()
    await vi.advanceTimersByTimeAsync(3000)

    expect(await resultPromise).toBe(false)
    vi.useRealTimers()
  })
})
