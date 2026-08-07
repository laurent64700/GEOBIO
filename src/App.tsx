import { useEffect, useState } from 'react'
import { MissionList } from './components/MissionList'
import { OfflineIndicator } from './components/OfflineIndicator'
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
      try {
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
        const missions = await listMissions()
        setPhase({ name: 'mission-list', missions })
      } catch (err) {
        setPhase({ name: 'error', message: err instanceof Error ? err.message : String(err) })
      }
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

  async function handleNavigateToMissionList() {
    try {
      const missions = await listMissions()
      setPhase({ name: 'mission-list', missions })
    } catch (err) {
      setPhase({ name: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  function handleNavigateToNewMission() {
    setPhase({ name: 'creating' })
  }

  return (
    <>
      <div style={{ height: '100vh', width: '100%' }}>
        {phase.name === 'loading-missions' && <p>Chargement…</p>}
        {phase.name === 'mission-list' && (
          <MissionList
            missions={phase.missions}
            onSelectMission={handleSelectMission}
            onCreateNew={() => setPhase({ name: 'creating' })}
          />
        )}
        {phase.name === 'creating' && (
          <MissionWorkspace
            onNavigateToMissionList={handleNavigateToMissionList}
            onNavigateToNewMission={handleNavigateToNewMission}
          />
        )}
        {phase.name === 'resuming' && (
          <MissionWorkspace
            initialResumePhase={phase.resumePhase}
            onNavigateToMissionList={handleNavigateToMissionList}
            onNavigateToNewMission={handleNavigateToNewMission}
          />
        )}
        {phase.name === 'error' && <p role="alert">{phase.message}</p>}
      </div>
      {/* Sibling of the phase-driven container, not nested inside any phase
          conditional — must stay mounted and visible across all app phases
          (mission list, resuming, error, etc.), per Task 8.3 / spec §4.7. */}
      <OfflineIndicator />
    </>
  )
}

export default App
