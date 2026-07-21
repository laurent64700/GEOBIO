import { useState } from 'react'
import { GridTemplatePicker } from './GridTemplatePicker'
import type { GridTemplate, GridLinePolarity, Point } from '../domain/types'

export interface GridCreationPanelProps {
  pendingOrigin: Point | null
  onOriginRequested: () => void
  onGenerate: (template: GridTemplate, origin: Point, polarity: GridLinePolarity) => void
}

type Step = 'collapsed' | 'picking-template' | 'awaiting-origin' | 'awaiting-polarity'

export function GridCreationPanel({ pendingOrigin, onOriginRequested, onGenerate }: GridCreationPanelProps) {
  const [template, setTemplate] = useState<GridTemplate | null>(null)
  const [polarity, setPolarity] = useState<GridLinePolarity>('+')
  const [expanded, setExpanded] = useState(false)

  const step: Step = !expanded
    ? 'collapsed'
    : !template
      ? 'picking-template'
      : !pendingOrigin
        ? 'awaiting-origin'
        : 'awaiting-polarity'

  function handleTemplateSelected(selected: GridTemplate) {
    setTemplate(selected)
    onOriginRequested()
  }

  if (step === 'collapsed') {
    return <button onClick={() => setExpanded(true)}>Ajouter une grille</button>
  }

  if (step === 'picking-template') {
    return <GridTemplatePicker onSelected={handleTemplateSelected} />
  }

  if (step === 'awaiting-origin') {
    return <p>Cliquez l'origine sur la carte.</p>
  }

  // step === 'awaiting-polarity'
  return (
    <div>
      <p>Quelle est la polarité ressentie sur ce point ?</p>
      <button
        onClick={() => setPolarity('+')}
        style={{ fontWeight: polarity === '+' ? 'bold' : 'normal' }}
      >
        +
      </button>
      <button
        onClick={() => setPolarity('-')}
        style={{ fontWeight: polarity === '-' ? 'bold' : 'normal' }}
      >
        -
      </button>
      <button onClick={() => onGenerate(template!, pendingOrigin!, polarity)}>Générer</button>
    </div>
  )
}
