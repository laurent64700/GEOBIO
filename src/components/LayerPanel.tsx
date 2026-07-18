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

// Positioned absolutely so this panel overlays SiteMapView's map (which has
// position: relative and a fixed-height wrapper) instead of flowing below it
// in normal document flow — the map box doesn't grow to fit its siblings, so
// an unpositioned panel would spill out of the visible map area and overlap
// whatever renders after SiteMapView in the parent (e.g. MissionWorkspace's
// "Importer un plan intérieur" label). zIndex 1000 matches Leaflet's own
// control convention as a reasonable default for "above the map."
const PANEL_STYLE = {
  position: 'absolute' as const,
  top: 8,
  right: 8,
  zIndex: 1000,
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
