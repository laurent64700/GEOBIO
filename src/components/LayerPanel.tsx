export const FELT_POINTS_LAYER_ID = 'felt-points'
export const FELT_SEGMENTS_LAYER_ID = 'felt-segments'
export const BAGUA_LAYER_ID = 'bagua'

// Single source of truth for which layer ids default to visible when absent
// from the `visibility` map. Duplicating this list (as a literal OR-chain) in
// each consumer is exactly how SiteMapView's toggleLayer "forgot" about
// FELT_SEGMENTS_LAYER_ID once already — see toggleLayer in SiteMapView.tsx.
export const DEFAULT_VISIBLE_LAYER_IDS: readonly string[] = [FELT_POINTS_LAYER_ID, FELT_SEGMENTS_LAYER_ID]

export interface LayerEntry {
  id: string
  label: string
  color: string
}

export interface LayerPanelProps {
  gridLayers: LayerEntry[]
  visibility: Record<string, boolean>
  onToggle: (id: string) => void
}

// This card no longer positions itself (no position/top/right/zIndex): as of
// Task 33, SiteMapView stacks it in a flex column together with
// GridCreationPanel in the shared top-right corner (the single
// <OverlayPanel corner="top-right"> in SiteMapView.tsx — see
// OverlayPanel.tsx). Positioning both cards absolutely and independently
// would either overlap (if their offsets don't account for each other's
// dynamic height — this panel grows with the number of grid layers) or
// require fragile hardcoded pixel math. Letting the shared flex container
// handle placement means the two cards simply stack, however tall either
// gets. Background/padding/radius stay here since they're this card's own
// visual chrome regardless of who positions it.
const PANEL_STYLE = {
  background: 'white',
  padding: 8,
  borderRadius: 4,
}

export function LayerPanel({ gridLayers, visibility, onToggle }: LayerPanelProps) {
  return (
    <div style={PANEL_STYLE}>
      <label>
        <input
          type="checkbox"
          checked={visibility[FELT_POINTS_LAYER_ID] ?? true}
          onChange={() => onToggle(FELT_POINTS_LAYER_ID)}
        />
        Ressenti terrain
      </label>
      <label>
        <input
          type="checkbox"
          checked={visibility[FELT_SEGMENTS_LAYER_ID] ?? true}
          onChange={() => onToggle(FELT_SEGMENTS_LAYER_ID)}
        />
        Tiges (segments ressentis)
      </label>
      {gridLayers.map((layer) => (
        <label key={layer.id}>
          <input
            type="checkbox"
            checked={visibility[layer.id] ?? false}
            onChange={() => onToggle(layer.id)}
          />
          <span style={{ color: layer.color }}>{layer.label}</span>
        </label>
      ))}
      <label>
        <input
          type="checkbox"
          checked={visibility[BAGUA_LAYER_ID] ?? false}
          onChange={() => onToggle(BAGUA_LAYER_ID)}
        />
        Bagua (Pakua)
      </label>
    </div>
  )
}
