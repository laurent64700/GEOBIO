import { useEffect, useState } from 'react'
import { MissionList } from './components/MissionList'
import { MissionWorkspace } from './pages/MissionWorkspace'
import { deriveResumePhase, type ResumePhase } from './pages/deriveResumePhase'
import { listMissions } from './data/missionsRepo'
import { isOnlineNow } from './offline/connectivity'
import { getCurrentSession, setCurrentSession } from './offline/currentSession'
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
    async function boot() {
      if (!(await isOnlineNow())) {
        const cached = await getCurrentSession()
        if (cached) {
          setPhase({
            name: 'resuming',
            resumePhase: { name: 'ready-no-interior', mission: cached.mission, exteriorPlan: cached.exteriorPlan },
          })
          return
        }
        // No cached session — fall through to the normal listMissions() path
        // below, which will fail offline and surface the 'error' phase.
        // This is the documented edge case: offline with nothing cached yet.
      }
      listMissions()
        .then((missions) => setPhase({ name: 'mission-list', missions }))
        .catch((err) => setPhase({ name: 'error', message: err instanceof Error ? err.message : String(err) }))
    }
    boot()
  }, [])

  async function handleSelectMission(mission: Mission) {
    try {
      const resumePhase = await deriveResumePhase(mission)
      if (resumePhase.name === 'ready-no-interior') {
        await setCurrentSession(resumePhase.mission, resumePhase.exteriorPlan)
      }
      setPhase({ name: 'resuming', resumePhase })
    } catch (err) {
      setPhase({ name: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div style={{ height: '100vh', width: '100%' }}>
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
