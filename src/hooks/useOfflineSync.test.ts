import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useOfflineSync } from './useOfflineSync'
import { isOnlineNow } from '../offline/connectivity'
import { listPendingMutations } from '../offline/pendingMutations'
import { flushPendingMutations } from '../offline/sync'
import type { PendingMutation } from '../offline/pendingMutations'

vi.mock('../offline/connectivity', () => ({ isOnlineNow: vi.fn() }))
vi.mock('../offline/pendingMutations', () => ({ listPendingMutations: vi.fn() }))
vi.mock('../offline/sync', () => ({ flushPendingMutations: vi.fn() }))

function mutation(id: number): PendingMutation {
  return { id, table: 'felt_point', operation: 'insert', payload: { id: `fp${id}` }, createdAt: '', attempts: 0 }
}

// Lets pending microtask chains (several `await`s deep) settle without
// advancing past any promise we're deliberately holding open.
async function flushMicrotasks(times = 3) {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('useOfflineSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(flushPendingMutations).mockResolvedValue(undefined)
  })

  it('flushes automatically on mount when already online with a backlog, and updates pendingCount after', async () => {
    vi.mocked(isOnlineNow).mockResolvedValue(true)
    vi.mocked(listPendingMutations)
      .mockResolvedValueOnce([mutation(1), mutation(2)]) // initial read
      .mockResolvedValueOnce([]) // post-flush read

    const { result } = renderHook(() => useOfflineSync())

    await waitFor(() => expect(flushPendingMutations).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
  })

  it('does not flush on mount while offline, but still reports the queued count', async () => {
    vi.mocked(isOnlineNow).mockResolvedValue(false)
    vi.mocked(listPendingMutations).mockResolvedValue([mutation(1), mutation(2), mutation(3)])

    const { result } = renderHook(() => useOfflineSync())

    await waitFor(() => expect(result.current.pendingCount).toBe(3))
    expect(flushPendingMutations).not.toHaveBeenCalled()
  })

  it("flushes when the 'online' event fires and isOnlineNow() re-confirms true", async () => {
    vi.mocked(listPendingMutations).mockResolvedValue([mutation(1)])
    vi.mocked(isOnlineNow).mockResolvedValue(false) // offline at mount: no mount-triggered flush

    renderHook(() => useOfflineSync())
    await flushMicrotasks()
    expect(flushPendingMutations).not.toHaveBeenCalled()

    vi.mocked(isOnlineNow).mockResolvedValue(true) // connectivity returns for real
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await flushMicrotasks()
    })

    expect(flushPendingMutations).toHaveBeenCalledTimes(1)
  })

  it("does NOT flush when the 'online' event fires but isOnlineNow() still resolves false (lying navigator.onLine)", async () => {
    vi.mocked(listPendingMutations).mockResolvedValue([mutation(1)])
    vi.mocked(isOnlineNow).mockResolvedValue(false)

    renderHook(() => useOfflineSync())
    await flushMicrotasks()
    expect(flushPendingMutations).not.toHaveBeenCalled()

    // navigator.onLine flips true (event fires) but the real probe still
    // says false — e.g. connected to a local router with no WAN uplink.
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await flushMicrotasks()
    })

    expect(flushPendingMutations).not.toHaveBeenCalled()
  })

  it('guards against concurrent flushes: an overlapping online event does not trigger a second flushPendingMutations call while one is in flight', async () => {
    vi.mocked(listPendingMutations).mockResolvedValue([mutation(1)])
    vi.mocked(isOnlineNow).mockResolvedValue(true)

    let resolveFlush!: () => void
    const inFlight = new Promise<void>((resolve) => {
      resolveFlush = resolve
    })
    vi.mocked(flushPendingMutations).mockReturnValue(inFlight)

    renderHook(() => useOfflineSync())

    // Let the mount-triggered flush start and set the in-flight guard,
    // without letting flushPendingMutations resolve.
    await act(async () => {
      await flushMicrotasks()
    })
    expect(flushPendingMutations).toHaveBeenCalledTimes(1)

    // Fire the 'online' event while the first flush is still in flight.
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await flushMicrotasks()
    })

    // Still only one call: the overlapping attempt was dropped because a
    // flush was already in flight, not queued up behind it.
    expect(flushPendingMutations).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveFlush()
      await inFlight
      await flushMicrotasks()
    })

    expect(flushPendingMutations).toHaveBeenCalledTimes(1)
  })

  it("removes the 'online' event listener on unmount", async () => {
    vi.mocked(isOnlineNow).mockResolvedValue(false)
    vi.mocked(listPendingMutations).mockResolvedValue([])

    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useOfflineSync())
    await flushMicrotasks()

    const onlineCall = addSpy.mock.calls.find(([eventName]) => eventName === 'online')
    expect(onlineCall).toBeDefined()
    const handler = onlineCall?.[1]

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('online', handler)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
