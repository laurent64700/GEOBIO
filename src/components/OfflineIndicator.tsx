// src/components/OfflineIndicator.tsx
import { useOfflineSync } from '../hooks/useOfflineSync'

// Small, permanent, always-visible indicator (spec §4.7: "Petit indicateur
// permanent et discret"). Deliberately NEVER returns null — even when fully
// synced, it stays on screen showing "Synchronisé" rather than disappearing,
// so the user always has a positive confirmation of sync state instead of
// having to infer "no indicator = synced" (which is indistinguishable from
// "indicator failed to mount").
//
// position: fixed (not absolute) so it stays anchored to the viewport corner
// regardless of which app phase / scrollable container is currently mounted
// — it lives as a sibling of App.tsx's root container, outside any of the
// positioned map/sidebar overlay contexts (OverlayPanel, Sidebar) that use
// position: absolute + zIndex: 1000. zIndex here is set above that stack
// (2000) since this indicator must always render on top of everything else.
const INDICATOR_STYLE = {
  position: 'fixed' as const,
  bottom: 8,
  right: 8,
  zIndex: 2000,
  padding: '4px 8px',
  borderRadius: 4,
  border: '1px solid #ccc',
  background: 'white',
  fontSize: 12,
  pointerEvents: 'none' as const,
}

export function OfflineIndicator() {
  const { pendingCount } = useOfflineSync()

  const text =
    pendingCount === 0 ? 'Synchronisé' : `Hors-ligne — ${pendingCount} modification(s) en attente`

  return <div style={INDICATOR_STYLE}>{text}</div>
}
