import { useState } from 'react'
import { MissionForm } from '../components/MissionForm'
import { MapView } from '../components/MapView'
import { createPlan } from '../data/plansRepo'
import type { Mission } from '../domain/types'

// Rough center of metropolitan France — a placeholder until a mission's
// address is geocoded to real coordinates. Geocoding isn't required by any
// Plan 1 spec requirement (§6.0-§6.2); the operator can pan/zoom the map
// manually to the actual site in the meantime.
const DEFAULT_CENTER: [number, number] = [46.6, 2.5]

export function MissionWorkspace() {
  const [mission, setMission] = useState<Mission | null>(null)
  const [planReady, setPlanReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleMissionCreated(created: Mission) {
    setMission(created)
    try {
      await createPlan({ missionId: created.id, kind: 'exterieur' })
      setPlanReady(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (!mission) {
    return <MissionForm onCreated={handleMissionCreated} />
  }

  if (error) {
    return <p role="alert">{error}</p>
  }

  if (!planReady) {
    return <p>Préparation du plan extérieur…</p>
  }

  return <MapView center={DEFAULT_CENTER} />
}
