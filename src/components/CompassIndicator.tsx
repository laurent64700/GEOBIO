// src/components/CompassIndicator.tsx
import { COMPASS_ORDER } from '../geometry/bagua'

// Fixed, non-interactive chrome — Leaflet never rotates the map, so "up" is
// always true north; this is a permanent visual reminder, not a live sensor
// (spec §6). N is visually emphasized (bold) as the primary reference.
const WRAPPER_STYLE = {
  width: 64,
  height: 64,
  borderRadius: '50%',
  border: '1px solid #999',
  background: 'white',
  position: 'relative' as const,
  fontSize: 10,
}

// One label per 45° step around the circle, N at the top (angle 0, measured
// clockwise from top) — matches COMPASS_ORDER's own index*45 convention
// already used by bagua.ts's computeBaguaSectors.
function positionFor(index: number) {
  const angleRad = ((index * 45 - 90) * Math.PI) / 180
  const radius = 26
  return {
    position: 'absolute' as const,
    left: `calc(50% + ${radius * Math.cos(angleRad)}px - 6px)`,
    top: `calc(50% + ${radius * Math.sin(angleRad)}px - 6px)`,
  }
}

export function CompassIndicator() {
  return (
    <div style={WRAPPER_STYLE}>
      {COMPASS_ORDER.map((direction, i) => (
        <span key={direction} style={{ ...positionFor(i), fontWeight: direction === 'N' ? 'bold' : 'normal' }}>
          {direction}
        </span>
      ))}
    </div>
  )
}
