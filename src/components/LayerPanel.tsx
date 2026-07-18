export const FELT_POINTS_LAYER_ID = 'felt-points'

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
// GridCreationPanel in the shared top-right corner (see TOP_RIGHT_STACK_STYLE
// in SiteMapView.tsx). Positioning both cards absolutely and independently
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
    </div>
  )
}
