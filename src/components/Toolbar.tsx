// src/components/Toolbar.tsx
import type { ReactNode } from 'react'

export interface ToolbarProps {
  children?: ReactNode
}

// Fixed-height, full-width, top-of-screen bar — spec §3 ("ruban Paint"). Height
// is a named constant (not just a magic number here) because Sidebar.tsx (a
// later task) AND MissionWorkspace.tsx's ready-no-interior column (this same
// task, Step 5) both need the exact same value: Sidebar to offset its own top
// position, MissionWorkspace to reserve equivalent space in normal flow —
// position:fixed takes this bar OUT of flow entirely, so nothing below it is
// pushed down automatically the way a normal flex/block sibling would be.
export const TOOLBAR_HEIGHT_PX = 48

const TOOLBAR_STYLE = {
  position: 'fixed' as const,
  top: 0,
  left: 0,
  right: 0,
  height: TOOLBAR_HEIGHT_PX,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 8px',
  background: 'white',
  borderBottom: '1px solid #ccc',
  zIndex: 1100, // above Sidebar's zIndex: 1000 so nothing overlaps it
}

export function Toolbar({ children }: ToolbarProps) {
  return (
    <div role="toolbar" style={TOOLBAR_STYLE}>
      {children}
    </div>
  )
}
