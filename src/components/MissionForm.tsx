import { useState, type FormEvent } from 'react'
import { createMission } from '../data/missionsRepo'
import type { Mission } from '../domain/types'

export interface MissionFormProps {
  onCreated: (mission: Mission) => void
}

export function MissionForm({ onCreated }: MissionFormProps) {
  const [address, setAddress] = useState('')
  const [missionDate, setMissionDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const mission = await createMission({ address, missionDate })
      onCreated(mission)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Adresse
        <input value={address} onChange={(e) => setAddress(e.target.value)} required />
      </label>
      <label>
        Date de mission
        <input
          type="date"
          value={missionDate}
          onChange={(e) => setMissionDate(e.target.value)}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Création…' : 'Créer la mission'}
      </button>
    </form>
  )
}
