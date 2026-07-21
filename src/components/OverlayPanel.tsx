// src/components/OverlayPanel.tsx
import type { ReactNode } from 'react'

export type OverlayCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface OverlayPanelProps {
  corner: OverlayCorner
  children: ReactNode
}

// Consolidates SiteMapView.tsx's four previously hand-duplicated *_STYLE
// constants (GUIDE_LINE_CONTROLS_STYLE, EDIT_CONTROLS_STYLE,
// ORTHOGONALITY_PANEL_STYLE, TOP_RIGHT_STACK_STYLE) into one component.
// position: absolute is required because SiteMapView's own wrapping div is
// position: relative inside a fixed-height parent (MissionWorkspace's
// MAP_WRAPPER_STYLE) — an unpositioned sibling would flow below the map box
// instead of overlaying it (this bug class has been hit and fixed multiple
// times across Tasks 29-33). The flex-column + maxHeight/overflowY
// treatment (previously TOP_RIGHT_STACK_STYLE-only) is generalized to all
// four corners, since more than one corner may need to stack multiple
// panels (this feature adds a second item to at least one corner — see
// Task 8/9).
const CORNER_STYLES: Record<OverlayCorner, { top?: number; bottom?: number; left?: number; right?: number; alignItems: 'flex-start' | 'flex-end' }> = {
  'top-left': { top: 8, left: 8, alignItems: 'flex-start' },
  'top-right': { top: 8, right: 8, alignItems: 'flex-end' },
  'bottom-left': { bottom: 8, left: 8, alignItems: 'flex-start' },
  'bottom-right': { bottom: 8, right: 8, alignItems: 'flex-end' },
}

export function OverlayPanel({ corner, children }: OverlayPanelProps) {
  const cornerStyle = CORNER_STYLES[corner]
  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxHeight: 'calc(100% - 16px)',
        maxWidth: 320,
        overflowY: 'auto',
        ...cornerStyle,
      }}
    >
      {children}
    </div>
  )
}
