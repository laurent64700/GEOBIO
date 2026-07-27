import type { PhenomenonKind } from '../domain/types'
import { PHENOMENON_ICONS } from '../domain/phenomenonIcons'

export interface PhenomenonPickerProps {
  activeKind: PhenomenonKind | null
  onSelectKind: (kind: PhenomenonKind | null) => void
}

const KIND_OPTIONS: { kind: PhenomenonKind; label: string }[] = [
  { kind: 'cheminee-1', label: 'Cheminée 1 branche' },
  { kind: 'cheminee-2', label: 'Cheminée 2 branches' },
  { kind: 'cheminee-3', label: 'Cheminée 3 branches' },
  { kind: 'cheminee-4', label: 'Cheminée 4 branches' },
  { kind: 'spire-vortex', label: 'Spire de vortex' },
  { kind: 'point-cosmique', label: 'Point cosmique' },
  { kind: 'carre-magique', label: 'Carré magique' },
  { kind: 'tube-magique', label: 'Tube magique' },
]

const ICON_STYLE = { width: 16, height: 16, verticalAlign: 'middle', marginRight: 4 }

// Legend of the 8 point-phenomenon kinds, doubling as the "arm placement mode"
// control: clicking a kind selects it for the next map click (see
// SiteMapView's PlacementMode 'phenomenon' variant), clicking the already-
// active kind again deselects it (onSelectKind(null)) — the same
// select/toggle-off pattern as the guide-line bearing presets, just
// surfaced here via aria-pressed instead of a disabled "Placer ici" button.
// Each button also previews the same icon PhenomenaLayer renders on the map
// (spec: "harmoniser pour être UX friendly") — aria-hidden since the icon is
// purely decorative here, so the button's accessible name stays the label.
export function PhenomenonPicker({ activeKind, onSelectKind }: PhenomenonPickerProps) {
  return (
    <div>
      <p>Cliquez sur la carte pour placer</p>
      {KIND_OPTIONS.map(({ kind, label }) => (
        <button
          key={kind}
          aria-pressed={activeKind === kind}
          onClick={() => onSelectKind(activeKind === kind ? null : kind)}
        >
          <span
            aria-hidden="true"
            style={ICON_STYLE}
            dangerouslySetInnerHTML={{ __html: PHENOMENON_ICONS[kind].svg }}
          />
          {label}
        </button>
      ))}
    </div>
  )
}
