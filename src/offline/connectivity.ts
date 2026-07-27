const PROBE_TIMEOUT_MS = 3000

// navigator.onLine alone can lie (true even with no real internet access —
// e.g. connected to a local router with no WAN uplink), so it's combined
// with a real lightweight network probe before declaring "online" for real
// (spec §4.3). Checking navigator.onLine FIRST avoids firing a network
// request at all in the common, correctly-detected offline case.
export async function isOnlineNow(): Promise<boolean> {
  if (!navigator.onLine) return false

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal })
    return response.ok || response.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}
