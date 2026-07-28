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
//
// top-right, below the compass: the left edge (top-to-bottom) is claimed by
// Sidebar.tsx's full-height column, and bottom-right is claimed by
// SiteMapView.tsx's orthogonality-review OverlayPanel (~SiteMapView.tsx:964,
// bottom:8/right:8) — placing this indicator there would visually collide
// with that card's "Redresser"/"Ignorer" buttons. top-right itself is used
// by SiteMapView.tsx's CompassIndicator wrapper (top:8/right:8, 64x64), so
// this sits far enough below it (top:84 = 8 + 64 + 12px gap) to clear the
// compass circle. Anyone adding another fixed/absolute-positioned UI element
// should check this file plus Sidebar.tsx, OverlayPanel.tsx and the compass
// wrapper in SiteMapView.tsx to avoid re-colliding with any of these.
const INDICATOR_STYLE = {
  position: 'fixed' as const,
  top: 84,
  right: 8,
  zIndex: 2000,
  padding: '4px 8px',
  borderRadius: 4,
  border: '1px solid #ccc',
  background: 'white',
  fontSize: 12,
  // Correct today because this is a purely informational badge with no
  // click target of its own. If a future "tap to see sync details" feature
  // makes it interactive, this must be revisited (dropped, or scoped to a
  // non-blocking sub-element) so the indicator itself becomes clickable.
  pointerEvents: 'none' as const,
}

export function OfflineIndicator() {
  const { pendingCount } = useOfflineSync()

  const text =
    pendingCount === 0 ? 'Synchronisé' : `Hors-ligne — ${pendingCount} modification(s) en attente`

  return <div style={INDICATOR_STYLE}>{text}</div>
}
