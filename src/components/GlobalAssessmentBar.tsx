// src/components/GlobalAssessmentBar.tsx
import { useState } from 'react'
import { CauseSlider } from './GlobalAssessmentForm'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback'
import type { GlobalAssessmentInput } from '../data/missionsRepo'

export interface GlobalAssessmentBarProps {
  values: GlobalAssessmentInput
  onChange: (values: GlobalAssessmentInput) => void
}

// clears the Sidebar's fixed 280px width (Chunk 1) — not rendered inside
// SiteMapView itself (spec §7: lives at the MissionWorkspace level, present
// only during ready-no-interior, absent during calibrating-interior), but
// still needs to sit beside the sidebar rather than under it when both are
// visible on the same screen. A normal flex child (not position:absolute) so
// it sits right after the map instead of pinning to the true viewport
// bottom, which used to leave a large empty gap on any window taller than
// the map's minimum content.
const BAR_STYLE = {
  marginLeft: 280,
  background: 'white',
  borderTop: '2px solid #ccc',
  flexShrink: 0,
  padding: '4px 8px',
}

const SLIDERS_ROW_STYLE = { display: 'flex', gap: 12, flexWrap: 'wrap' as const, paddingTop: 8 }

const DEBOUNCE_MS = 500

// Permanent, always-editable duplicate of GlobalAssessmentForm's 6 sliders
// (spec §7) — auto-saves on change (debounced), no explicit save button,
// deliberately separate component from GlobalAssessmentForm (which keeps its
// own one-time "Enregistrer" button for the initial mandatory step).
//
// Collapsed by default (native <details>, uncontrolled — nothing outside
// this component ever needs to force it open/closed): Laurent only fills
// these in at the start and end of a survey, for the final report, not
// during the releved itself, so keeping the full 6-control row permanently
// on screen just ate map height for no benefit the rest of the time (field
// testing 08/2026: "les curseurs en bas ne servent qu'au début et à la fin
// pour le rapport... la carte plein pot"). Collapsed, this is a single
// <summary> line; expanded, identical to the previous always-visible row.
export function GlobalAssessmentBar({ values, onChange }: GlobalAssessmentBarProps) {
  const [local, setLocal] = useState(values)
  const debouncedOnChange = useDebouncedCallback(onChange, DEBOUNCE_MS)

  function update(field: keyof GlobalAssessmentInput, value: number) {
    const next = { ...local, [field]: value }
    setLocal(next)
    debouncedOnChange(next)
  }

  return (
    <details style={BAR_STYLE}>
      <summary>Bilan global</summary>
      <div style={SLIDERS_ROW_STYLE}>
        <CauseSlider label="Architectural" value={local.causeArchitectural} onChange={(v) => update('causeArchitectural', v)} />
        <CauseSlider label="Électromagnétique" value={local.causeElectromagnetique} onChange={(v) => update('causeElectromagnetique', v)} />
        <CauseSlider label="Géobiologique" value={local.causeGeobiologique} onChange={(v) => update('causeGeobiologique', v)} />
        <CauseSlider label="Paranormal" value={local.causeParanormale} onChange={(v) => update('causeParanormale', v)} />
        <CauseSlider label="Autres" value={local.causeAutres} onChange={(v) => update('causeAutres', v)} />
        <label>
          Taux vibratoire (Bovis)
          {/* Plain number field, not a slider — see GlobalAssessmentForm.tsx's
              matching comment (field testing 08/2026: imprecise on a
              0-180000 range, Laurent wants to type the exact reading). */}
          <input
            type="number" min={0}
            value={local.bovisRate}
            onChange={(e) => update('bovisRate', Number(e.target.value))}
          />
        </label>
      </div>
    </details>
  )
}
