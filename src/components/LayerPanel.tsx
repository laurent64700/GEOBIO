export const FELT_POINTS_LAYER_ID = 'felt-points'
export const FELT_SEGMENTS_LAYER_ID = 'felt-segments'
export const BAGUA_LAYER_ID = 'bagua'
export const PATHOGENIC_CROSSINGS_LAYER_ID = 'pathogenic-crossings'
export const PHENOMENA_LAYER_ID = 'phenomena'
export const FREEFORM_NETWORK_LAYER_ID = 'freeform-network'
export const INTERIOR_PLAN_LAYER_ID = 'interior-plan'
export const CONTEXT_OBJECTS_LAYER_ID = 'context-objects'

// Single source of truth for which layer ids default to visible when absent
// from the `visibility` map. Duplicating this list (as a literal OR-chain) in
// each consumer is exactly how SiteMapView's toggleLayer "forgot" about
// FELT_SEGMENTS_LAYER_ID once already — see toggleLayer in SiteMapView.tsx.
//
// ONLY felt points/segments, the calibrated interior plan, and context
// objects default visible. Everything else (grid instance lines, Bagua
// sectors, Hartmann×Curry pathogenic crossings, phenomena, freeform
// eau/faille traces) is deliberately hidden by default: Laurent does blind
// sensing ("ressenti aveugle") without any theoretical/reference overlay
// visible, to avoid biasing what he feels toward what the model predicts or
// toward markers he already placed — he turns these on afterward, in a
// separate correction/verification pass. Confirmed explicitly in
// LayerPanel.test.tsx/SiteMapView.test.tsx test names ("unchecked by
// default, like Bagua/pathogenic-crossings") — do not add PHENOMENA_LAYER_ID,
// FREEFORM_NETWORK_LAYER_ID, BAGUA_LAYER_ID, PATHOGENIC_CROSSINGS_LAYER_ID or
// grid instance ids here without confirming with Laurent first; a field test
// on 2026-08-06 raised "I can't get X to show" for phenomena/freeform
// specifically, which looked at first like a default-visibility bug but
// turned out to conflict with this existing, tested, deliberate design —
// left as an open question for Laurent to resolve, not silently changed.
export const DEFAULT_VISIBLE_LAYER_IDS: readonly string[] = [
  FELT_POINTS_LAYER_ID,
  FELT_SEGMENTS_LAYER_ID,
  INTERIOR_PLAN_LAYER_ID,
  CONTEXT_OBJECTS_LAYER_ID,
]

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
          checked={visibility[FELT_POINTS_LAYER_ID] ?? DEFAULT_VISIBLE_LAYER_IDS.includes(FELT_POINTS_LAYER_ID)}
          onChange={() => onToggle(FELT_POINTS_LAYER_ID)}
        />
        Ressenti terrain
      </label>
      <label>
        <input
          type="checkbox"
          checked={visibility[FELT_SEGMENTS_LAYER_ID] ?? DEFAULT_VISIBLE_LAYER_IDS.includes(FELT_SEGMENTS_LAYER_ID)}
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
          checked={visibility[BAGUA_LAYER_ID] ?? DEFAULT_VISIBLE_LAYER_IDS.includes(BAGUA_LAYER_ID)}
          onChange={() => onToggle(BAGUA_LAYER_ID)}
        />
        Bagua (Pakua)
      </label>
      <label>
        <input
          type="checkbox"
          checked={visibility[PATHOGENIC_CROSSINGS_LAYER_ID] ?? DEFAULT_VISIBLE_LAYER_IDS.includes(PATHOGENIC_CROSSINGS_LAYER_ID)}
          onChange={() => onToggle(PATHOGENIC_CROSSINGS_LAYER_ID)}
        />
        Croisements pathogènes
      </label>
      <label>
        <input
          type="checkbox"
          checked={visibility[PHENOMENA_LAYER_ID] ?? DEFAULT_VISIBLE_LAYER_IDS.includes(PHENOMENA_LAYER_ID)}
          onChange={() => onToggle(PHENOMENA_LAYER_ID)}
        />
        Phénomènes ponctuels
      </label>
      <label>
        <input
          type="checkbox"
          checked={visibility[FREEFORM_NETWORK_LAYER_ID] ?? DEFAULT_VISIBLE_LAYER_IDS.includes(FREEFORM_NETWORK_LAYER_ID)}
          onChange={() => onToggle(FREEFORM_NETWORK_LAYER_ID)}
        />
        Tracés eau/faille
      </label>
      <label>
        <input
          type="checkbox"
          checked={visibility[INTERIOR_PLAN_LAYER_ID] ?? DEFAULT_VISIBLE_LAYER_IDS.includes(INTERIOR_PLAN_LAYER_ID)}
          onChange={() => onToggle(INTERIOR_PLAN_LAYER_ID)}
        />
        Plan intérieur calé
      </label>
      <label>
        <input
          type="checkbox"
          checked={visibility[CONTEXT_OBJECTS_LAYER_ID] ?? DEFAULT_VISIBLE_LAYER_IDS.includes(CONTEXT_OBJECTS_LAYER_ID)}
          onChange={() => onToggle(CONTEXT_OBJECTS_LAYER_ID)}
        />
        Objets de contexte (mobilier, extérieur)
      </label>
    </div>
  )
}
