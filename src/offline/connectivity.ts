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
    // Must probe the REST API path (/rest/v1/, same as supabaseClient.ts's
    // real calls) WITH the apikey header — not the bare project root. The
    // root domain doesn't send CORS headers for an arbitrary cross-origin
    // request, so a HEAD request to it fails even when genuinely online,
    // making this probe report "offline" while every other Supabase call in
    // the app succeeds at the same moment (Laurent, field testing 08/2026:
    // "indique hors ligne alors que connecté" — blocked mission deletion
    // with "Suppression indisponible hors-ligne" on a real, connected
    // device). /rest/v1/ is the actual PostgREST gateway, configured with
    // real CORS support since it's what the app depends on for everything.
    const url = import.meta.env.VITE_SUPABASE_URL as string
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
    const response = await fetch(`${url}/rest/v1/`, {
      method: 'HEAD',
      headers: { apikey: anonKey },
      signal: controller.signal,
    })
    return response.ok || response.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}
