import { useEffect, useState } from 'react'
import { MissionList } from './components/MissionList'
import { MissionWorkspace } from './pages/MissionWorkspace'
import { deriveResumePhase, type ResumePhase } from './pages/deriveResumePhase'
import { listMissions } from './data/missionsRepo'
import type { Mission } from './domain/types'
import './App.css'

type AppPhase =
  | { name: 'loading-missions' }
  | { name: 'mission-list'; missions: Mission[] }
  | { name: 'creating' }
  | { name: 'resuming'; resumePhase: ResumePhase }
  | { name: 'error'; message: string }

function App() {
  const [phase, setPhase] = useState<AppPhase>({ name: 'loading-missions' })

  useEffect(() => {
    listMissions()
      .then((missions) => setPhase({ name: 'mission-list', missions }))
      .catch((err) => setPhase({ name: 'error', message: err instanceof Error ? err.message : String(err) }))
  }, [])

  async function handleSelectMission(mission: Mission) {
    try {
      const resumePhase = await deriveResumePhase(mission)
      setPhase({ name: 'resuming', resumePhase })
    } catch (err) {
      setPhase({ name: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      {phase.name === 'loading-missions' && <p>Chargement…</p>}
      {phase.name === 'mission-list' && (
        <MissionList
          missions={phase.missions}
          onSelectMission={handleSelectMission}
          onCreateNew={() => setPhase({ name: 'creating' })}
        />
      )}
      {phase.name === 'creating' && <MissionWorkspace />}
      {phase.name === 'resuming' && <MissionWorkspace initialResumePhase={phase.resumePhase} />}
      {phase.name === 'error' && <p role="alert">{phase.message}</p>}
    </div>
  )
}

export default App
