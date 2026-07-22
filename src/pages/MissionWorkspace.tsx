// src/pages/MissionWorkspace.tsx (full replacement)
import { useState } from 'react'
import { MissionForm } from '../components/MissionForm'
import { MapView } from '../components/MapView'
import { SiteMapView } from '../components/SiteMapView'
import { PlanCalibrationTool } from '../components/PlanCalibrationTool'
import { GlobalAssessmentForm } from '../components/GlobalAssessmentForm'
import { GlobalAssessmentBar } from '../components/GlobalAssessmentBar'
import { MissionPhotosGallery } from '../components/MissionPhotosGallery'
import { createPlan } from '../data/plansRepo'
import { setMissionOrigin, setGlobalAssessment, type GlobalAssessmentInput } from '../data/missionsRepo'
import { uploadPlanImage } from '../data/planImageStorage'
import { geocodeAddress } from '../data/geocodingService'
import type { AffineTransform, Mission, Plan } from '../domain/types'
import type { LatLng } from '../geometry/localCoordinates'
import type { ResumePhase } from './deriveResumePhase'

// Rough center of metropolitan France — a placeholder until a mission's address
// is geocoded to real coordinates. Geocoding isn't required by any Plan 1 spec
// requirement (§6.0-§6.2); the operator can pan/zoom the map manually in the
// meantime.
const DEFAULT_CENTER: [number, number] = [46.6, 2.5]

// MapView's root element is styled height: '100%', which resolves against its
// parent's actual (not content-derived) height. Every wrapper that directly
// contains a <MapView> must therefore give it an explicit concrete height —
// a flex child with flex:1 inside a definite-height flex column satisfies
// this the same way a fixed pixel height would (both resolve to a real,
// non-auto computed height), and additionally lets the map use whatever
// vertical space the browser window actually has instead of being capped at
// an arbitrary fixed size regardless of window height. minHeight: 0
// overrides flexbox's default min-height:auto, which would otherwise let
// the map refuse to shrink below its content size and break the flex
// layout on a short window.
const MAP_WRAPPER_STYLE = { flex: 1, minHeight: 0 }
const FLEX_COLUMN_FULL_HEIGHT_STYLE = { display: 'flex', flexDirection: 'column' as const, height: '100%' }

type WorkspacePhase =
  | { name: 'creating-mission' }
  | { name: 'creating-exterior-plan'; mission: Mission }
  | { name: 'global-assessment'; mission: Mission; exteriorPlan: Plan }
  | { name: 'setting-origin'; mission: Mission; exteriorPlan: Plan; mapCenter: [number, number] }
  | { name: 'ready-no-interior'; mission: Mission; exteriorPlan: Plan }
  | { name: 'calibrating-interior'; mission: Mission; exteriorPlan: Plan; imageUrl: string }
  | { name: 'error'; message: string }

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export interface MissionWorkspaceProps {
  initialResumePhase?: ResumePhase
}

export function MissionWorkspace({ initialResumePhase }: MissionWorkspaceProps) {
  const [phase, setPhase] = useState<WorkspacePhase>(
    initialResumePhase
      ? (initialResumePhase.name === 'setting-origin'
          ? { ...initialResumePhase, mapCenter: DEFAULT_CENTER } // resumed missions skip re-geocoding for now — a deliberate scope cut for this plan, not spec-mandated (spec §8 doesn't carve out an exception for the resume path); geocoding (Chunk 6) only runs on the fresh-creation path today
          : initialResumePhase)
      : { name: 'creating-mission' }
  )

  async function handleMissionCreated(mission: Mission) {
    setPhase({ name: 'creating-exterior-plan', mission })
    try {
      const exteriorPlan = await createPlan({ missionId: mission.id, kind: 'exterieur' })
      setPhase({ name: 'global-assessment', mission, exteriorPlan })
    } catch (err) {
      setPhase({ name: 'error', message: messageOf(err) })
    }
  }

  async function handleGlobalAssessmentSaved(input: GlobalAssessmentInput) {
    if (phase.name !== 'global-assessment') return
    try {
      const updated = await setGlobalAssessment(phase.mission.id, input)
      const geocoded = await geocodeAddress(updated.address)
      const mapCenter: [number, number] = geocoded ? [geocoded.lat, geocoded.lng] : DEFAULT_CENTER
      setPhase({ name: 'setting-origin', mission: updated, exteriorPlan: phase.exteriorPlan, mapCenter })
    } catch (err) {
      setPhase({ name: 'error', message: messageOf(err) })
    }
  }

  async function handleOriginClick(latlng: LatLng) {
    if (phase.name !== 'setting-origin') return
    try {
      const updated = await setMissionOrigin(phase.mission.id, latlng)
      setPhase({ name: 'ready-no-interior', mission: updated, exteriorPlan: phase.exteriorPlan })
    } catch (err) {
      setPhase({ name: 'error', message: messageOf(err) })
    }
  }

  async function handleInteriorFileChosen(file: File) {
    if (phase.name !== 'ready-no-interior') return
    try {
      const url = await uploadPlanImage(phase.mission.id, file)
      setPhase({
        name: 'calibrating-interior',
        mission: phase.mission,
        exteriorPlan: phase.exteriorPlan,
        imageUrl: url,
      })
    } catch (err) {
      setPhase({ name: 'error', message: messageOf(err) })
    }
  }

  async function handleInteriorCalibrated(calibration: AffineTransform) {
    if (phase.name !== 'calibrating-interior') return
    try {
      await createPlan({
        missionId: phase.mission.id,
        kind: 'interieur',
        imageUrl: phase.imageUrl,
        calibration,
      })
      // Back to the map view — Plan 1 doesn't yet render the calibrated
      // overlay visually (see this task's scope note).
      setPhase({ name: 'ready-no-interior', mission: phase.mission, exteriorPlan: phase.exteriorPlan })
    } catch (err) {
      setPhase({ name: 'error', message: messageOf(err) })
    }
  }

  switch (phase.name) {
    case 'creating-mission':
      return <MissionForm onCreated={handleMissionCreated} />

    case 'creating-exterior-plan':
      return <p>Préparation du plan extérieur…</p>

    case 'global-assessment':
      return <GlobalAssessmentForm onSaved={handleGlobalAssessmentSaved} />

    case 'setting-origin':
      return (
        <div style={FLEX_COLUMN_FULL_HEIGHT_STYLE}>
          <p>Cliquez sur la carte à l'endroit qui servira d'origine du site.</p>
          <div style={MAP_WRAPPER_STYLE}>
            <MapView center={phase.mapCenter} onMapClick={handleOriginClick} />
          </div>
        </div>
      )

    case 'ready-no-interior': {
      // originLat/originLng are guaranteed non-null here: this phase is only
      // ever entered via setMissionOrigin's successful response (above) or
      // after returning from interior calibration (which requires having
      // passed through here first).
      const { originLat, originLng } = phase.mission
      return (
        <div style={FLEX_COLUMN_FULL_HEIGHT_STYLE}>
          <div style={MAP_WRAPPER_STYLE}>
            <SiteMapView
              planId={phase.exteriorPlan.id}
              missionId={phase.mission.id}
              missionOrigin={{ lat: originLat!, lng: originLng! }}
              initialBuildingFootprint={phase.mission.buildingFootprint}
            />
          </div>
          <label>
            Importer un plan intérieur (optionnel)
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleInteriorFileChosen(e.target.files[0])}
            />
          </label>
          <MissionPhotosGallery
            missionId={phase.mission.id}
            planId={phase.exteriorPlan.id}
            missionOrigin={{ lat: originLat!, lng: originLng! }}
          />
          <GlobalAssessmentBar
            values={{
              causeArchitectural: phase.mission.causeArchitectural ?? 0,
              causeElectromagnetique: phase.mission.causeElectromagnetique ?? 0,
              causeGeobiologique: phase.mission.causeGeobiologique ?? 0,
              causeParanormale: phase.mission.causeParanormale ?? 0,
              causeAutres: phase.mission.causeAutres ?? 0,
              bovisRate: phase.mission.bovisRate ?? 0,
            }}
            onChange={async (values) => {
              const updated = await setGlobalAssessment(phase.mission.id, values)
              setPhase({ name: 'ready-no-interior', mission: updated, exteriorPlan: phase.exteriorPlan })
            }}
          />
        </div>
      )
    }

    case 'calibrating-interior':
      return (
        <PlanCalibrationTool
          imageUrl={phase.imageUrl}
          missionOrigin={{ lat: phase.mission.originLat!, lng: phase.mission.originLng! }}
          mapCenter={[phase.mission.originLat!, phase.mission.originLng!]}
          onCalibrated={handleInteriorCalibrated}
        />
      )

    case 'error':
      return <p role="alert">{phase.message}</p>
  }
}
