// src/components/GlobalAssessmentForm.tsx
import { useState } from 'react'
import type { GlobalAssessmentInput } from '../data/missionsRepo'

export interface GlobalAssessmentFormProps {
  onSaved: (input: GlobalAssessmentInput) => void
}

export interface CauseSliderProps {
  label: string
  value: number
  onChange: (v: number) => void
}

export function CauseSlider({ label, value, onChange }: CauseSliderProps) {
  return (
    <label>
      {label}
      <input
        type="range" min={0} max={10} step={1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {/* <output>, not <span>: @testing-library/dom's getByLabelText computes a
          wrapping <label>'s accessible text from all descendant text nodes
          except a fixed set of form-control tags (button/meter/output/
          progress/select/textarea/input, see label-helpers.js:getTextContent).
          A <span> here would fold "3" into the label text, breaking the
          exact-match `getByLabelText('Architectural')` in the tests below. */}
      <output>{value}</output>
    </label>
  )
}

export function GlobalAssessmentForm({ onSaved }: GlobalAssessmentFormProps) {
  const [causeArchitectural, setCauseArchitectural] = useState(0)
  const [causeElectromagnetique, setCauseElectromagnetique] = useState(0)
  const [causeGeobiologique, setCauseGeobiologique] = useState(0)
  const [causeParanormale, setCauseParanormale] = useState(0)
  const [causeAutres, setCauseAutres] = useState(0)
  const [bovisRate, setBovisRate] = useState(0)

  return (
    <div>
      <CauseSlider label="Architectural" value={causeArchitectural} onChange={setCauseArchitectural} />
      <CauseSlider label="Électromagnétique" value={causeElectromagnetique} onChange={setCauseElectromagnetique} />
      <CauseSlider label="Géobiologique" value={causeGeobiologique} onChange={setCauseGeobiologique} />
      <CauseSlider label="Paranormal" value={causeParanormale} onChange={setCauseParanormale} />
      <CauseSlider label="Autres" value={causeAutres} onChange={setCauseAutres} />
      <label>
        Taux vibratoire (Bovis)
        {/* A plain number field, not a slider — Laurent reads this directly
            off a dowsing chart and types the exact figure; a 0-180000 range
            slider couldn't land on a precise value (field testing 08/2026). */}
        <input
          type="number" min={0} value={bovisRate}
          onChange={(e) => setBovisRate(Number(e.target.value))}
        />
      </label>
      <button
        onClick={() =>
          onSaved({
            causeArchitectural, causeElectromagnetique, causeGeobiologique,
            causeParanormale, causeAutres, bovisRate,
          })
        }
      >
        Enregistrer les mesures globales
      </button>
    </div>
  )
}
