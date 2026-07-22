// src/components/GlobalAssessmentBar.tsx
import { useState } from 'react'
import { CauseSlider } from './GlobalAssessmentForm'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback'
import type { GlobalAssessmentInput } from '../data/missionsRepo'

export interface GlobalAssessmentBarProps {
  values: GlobalAssessmentInput
  onChange: (values: GlobalAssessmentInput) => void
}

const BAR_STYLE = {
  position: 'absolute' as const,
  left: 280, // clears the Sidebar's fixed 280px width (Chunk 1) — not
  // rendered inside SiteMapView itself (spec §7: lives at the
  // MissionWorkspace level, present only during ready-no-interior, absent
  // during calibrating-interior), but still needs to sit beside the sidebar
  // rather than under it when both are visible on the same screen.
  right: 0,
  bottom: 0,
  background: 'white',
  borderTop: '2px solid #ccc',
  display: 'flex',
  gap: 12,
  padding: 8,
  zIndex: 1000,
}

const DEBOUNCE_MS = 500

// Permanent, always-editable duplicate of GlobalAssessmentForm's 6 sliders
// (spec §7) — auto-saves on change (debounced), no explicit save button,
// deliberately separate component from GlobalAssessmentForm (which keeps its
// own one-time "Enregistrer" button for the initial mandatory step).
export function GlobalAssessmentBar({ values, onChange }: GlobalAssessmentBarProps) {
  const [local, setLocal] = useState(values)
  const debouncedOnChange = useDebouncedCallback(onChange, DEBOUNCE_MS)

  function update(field: keyof GlobalAssessmentInput, value: number) {
    const next = { ...local, [field]: value }
    setLocal(next)
    debouncedOnChange(next)
  }

  return (
    <div style={BAR_STYLE}>
      <CauseSlider label="Architectural" value={local.causeArchitectural} onChange={(v) => update('causeArchitectural', v)} />
      <CauseSlider label="Électromagnétique" value={local.causeElectromagnetique} onChange={(v) => update('causeElectromagnetique', v)} />
      <CauseSlider label="Géobiologique" value={local.causeGeobiologique} onChange={(v) => update('causeGeobiologique', v)} />
      <CauseSlider label="Paranormal" value={local.causeParanormale} onChange={(v) => update('causeParanormale', v)} />
      <CauseSlider label="Autres" value={local.causeAutres} onChange={(v) => update('causeAutres', v)} />
      <label>
        Taux vibratoire (Bovis)
        <input
          type="range" min={0} max={180000} step={500}
          value={local.bovisRate}
          onChange={(e) => update('bovisRate', Number(e.target.value))}
        />
        <output>{local.bovisRate}</output>
      </label>
    </div>
  )
}
