import type { ContextObjectKind } from '../domain/types'
import { CONTEXT_OBJECT_KINDS } from '../domain/contextObjectKinds'

export interface ContextObjectPickerProps {
  activeKind: ContextObjectKind | null
  onSelectKind: (kind: ContextObjectKind | null) => void
}

const ICON_STYLE = { width: 16, height: 16, verticalAlign: 'middle', marginRight: 4 }

const INTERIEUR_KINDS = CONTEXT_OBJECT_KINDS.filter((k) => k.category === 'interieur')
const EXTERIEUR_KINDS = CONTEXT_OBJECT_KINDS.filter((k) => k.category === 'exterieur')

// Same select/toggle-off placement-arming pattern as PhenomenonPicker: click
// a kind to arm it for the next map click, click it again to cancel. Split
// into two groups (spec: "une mini bibliothèque de mobilier... ET une mini
// biblio pour l'extérieur") so Laurent isn't scanning one long flat list to
// find "arbre" versus "canapé".
export function ContextObjectPicker({ activeKind, onSelectKind }: ContextObjectPickerProps) {
  function renderGroup(kinds: typeof CONTEXT_OBJECT_KINDS) {
    return kinds.map(({ kind, label, svg }) => (
      <button
        key={kind}
        aria-pressed={activeKind === kind}
        onClick={() => onSelectKind(activeKind === kind ? null : kind)}
      >
        <span aria-hidden="true" style={ICON_STYLE} dangerouslySetInnerHTML={{ __html: svg }} />
        {label}
      </button>
    ))
  }

  return (
    <div>
      <p>Ajouter un élément de contexte (absent de la photo)</p>
      <p>Intérieur</p>
      {renderGroup(INTERIEUR_KINDS)}
      <p>Extérieur</p>
      {renderGroup(EXTERIEUR_KINDS)}
    </div>
  )
}
