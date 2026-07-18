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

export function LayerPanel({ gridLayers, visibility, onToggle }: LayerPanelProps) {
  return (
    <div>
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
