import { useCallback, useEffect, useRef, useState } from 'react'
import { isOnlineNow } from '../offline/connectivity'
import { listPendingMutations } from '../offline/pendingMutations'
import { flushPendingMutations } from '../offline/sync'

/**
 * Keeps the offline pending-mutation queue draining automatically, without
 * requiring any user action.
 *
 * Two entry points trigger a flush attempt:
 *  - Mount: covers the "closed the app offline in the field, reopened later
 *    already on wifi" case. No offline→online *transition* happens within
 *    that new session, so the browser's 'online' event never fires for it —
 *    relying on the event alone would leave those mutations stuck forever.
 *  - The browser's 'online' event: covers the "app was already open,
 *    connectivity came back" case.
 *
 * Both paths re-verify with isOnlineNow() (the real network probe) before
 * flushing. navigator.onLine — what the 'online' event is based on — can
 * report true with no real WAN uplink (e.g. connected to a local router
 * with no internet, a realistic scenario at rural survey sites). Flushing
 * on that false positive wouldn't move anything forward; it would just
 * bump `attempts` on every queued mutation for nothing.
 *
 * A ref-based in-flight guard ensures at most one flushPendingMutations()
 * call is ever in flight at a time. Without it, a mount-triggered flush and
 * an event-triggered flush that happen to overlap could both read and
 * replay the same queued mutation concurrently — the loser would get a
 * duplicate-key error from Supabase on an insert the winner already
 * completed, leaving a phantom entry that fails forever on retry.
 *
 * `flushNow` (== the internal `attemptFlush`) exposes a third, manual entry
 * point for callers that want to trigger a flush directly (e.g. a "Save"
 * menu action). It shares the same in-flight guard as the two automatic
 * triggers: calling it while a flush is already running resolves
 * immediately as a silent no-op rather than queuing up behind it — a caller
 * cannot tell "actually flushed" from "skipped" from the resolved promise
 * alone. It can also reject: the `try/finally` around flushPendingMutations()
 * only guarantees the `finally` cleanup runs, it does not swallow a
 * rejection, so callers of `flushNow` must handle that themselves.
 */
export function useOfflineSync(): { pendingCount: number; flushNow: () => Promise<void> } {
  const [pendingCount, setPendingCount] = useState(0)
  const flushingRef = useRef(false)
  const mountedRef = useRef(true)

  const refreshCount = useCallback(async () => {
    const mutations = await listPendingMutations()
    if (mountedRef.current) setPendingCount(mutations.length)
  }, [])

  // Refreshes pendingCount after every attempt, success or failure, since a
  // flush can partially succeed (some entries removed, some left behind).
  const attemptFlush = useCallback(async () => {
    if (flushingRef.current) return
    flushingRef.current = true
    try {
      await flushPendingMutations()
    } finally {
      flushingRef.current = false
      await refreshCount()
    }
  }, [refreshCount])

  const flushIfReallyOnline = useCallback(async () => {
    const online = await isOnlineNow()
    if (online) await attemptFlush()
  }, [attemptFlush])

  useEffect(() => {
    mountedRef.current = true

    // Sequential on purpose: get the current queue length on screen first,
    // then (if warranted) flush — a flush success will refresh the count
    // again on top of this one, but ordering it this way avoids two
    // concurrent initial reads racing to set stale state.
    void (async () => {
      await refreshCount()
      await flushIfReallyOnline()
    })()

    const handleOnline = () => {
      void flushIfReallyOnline()
    }
    window.addEventListener('online', handleOnline)

    return () => {
      mountedRef.current = false
      window.removeEventListener('online', handleOnline)
    }
  }, [refreshCount, flushIfReallyOnline])

  return { pendingCount, flushNow: attemptFlush }
}
