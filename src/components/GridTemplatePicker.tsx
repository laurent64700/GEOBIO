import { useEffect, useState, type FormEvent } from 'react'
import { createGridTemplate, listGridTemplates } from '../data/gridTemplatesRepo'
import type { GridTemplate } from '../domain/types'

export interface GridTemplatePickerProps {
  onSelected: (template: GridTemplate) => void
}

export function GridTemplatePicker({ onSelected }: GridTemplatePickerProps) {
  const [templates, setTemplates] = useState<GridTemplate[] | null>(null)
  const [name, setName] = useState('')
  const [spacingXM, setSpacingXM] = useState('')
  const [spacingYM, setSpacingYM] = useState('')
  const [angleTrueNorthDeg, setAngleTrueNorthDeg] = useState('')
  const [color, setColor] = useState('#888888')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listGridTemplates()
      .then(setTemplates)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    try {
      const template = await createGridTemplate({
        name,
        spacingXM: Number(spacingXM),
        spacingYM: Number(spacingYM),
        angleTrueNorthDeg: Number(angleTrueNorthDeg),
        originOffsetX: 0,
        originOffsetY: 0,
        color,
      })
      onSelected(template)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (templates === null) return <p>Chargement des gabarits…</p>

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {templates.length === 0 ? (
        <p>Aucun gabarit existant — créez-en un.</p>
      ) : (
        <ul>
          {templates.map((t) => (
            <li key={t.id}>
              <button onClick={() => onSelected(t)}>{t.name}</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleCreate}>
        <label>
          Nom
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Espacement X (m)
          <input
            type="number" step="0.01" value={spacingXM}
            onChange={(e) => setSpacingXM(e.target.value)} required
          />
        </label>
        <label>
          Espacement Y (m)
          <input
            type="number" step="0.01" value={spacingYM}
            onChange={(e) => setSpacingYM(e.target.value)} required
          />
        </label>
        <label>
          Angle par rapport au nord vrai (degrés)
          <input
            type="number" step="0.1" value={angleTrueNorthDeg}
            onChange={(e) => setAngleTrueNorthDeg(e.target.value)} required
          />
        </label>
        <label>
          Couleur
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <button type="submit">Créer le gabarit</button>
      </form>
    </div>
  )
}
