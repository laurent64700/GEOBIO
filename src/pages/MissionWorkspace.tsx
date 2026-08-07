// src/pages/MissionWorkspace.tsx (full replacement)
import { useState } from 'react'
import { MissionForm } from '../components/MissionForm'
import { MapView } from '../components/MapView'
import { SiteMapView } from '../components/SiteMapView'
import { PlanCalibrationTool } from '../components/PlanCalibrationTool'
import { GlobalAssessmentForm } from '../components/GlobalAssessmentForm'
import { GlobalAssessmentBar } from '../components/GlobalAssessmentBar'
import { MissionPhotosGallery } from '../components/MissionPhotosGallery'
import { ParcelSelectionStep } from '../components/ParcelSelectionStep'
import { Toolbar, TOOLBAR_HEIGHT_PX } from '../components/Toolbar'
import { UndoRedoControls } from '../components/UndoRedoControls'
import { MenuBar } from '../components/MenuBar'
import { createPlan } from '../data/plansRepo'
import {
  setMissionOrigin,
  setGlobalAssessment,
  setSelectedParcels,
  duplicateMission,
  type GlobalAssessmentInput,
} from '../data/missionsRepo'
import { uploadPlanImage } from '../data/planImageStorage'
import { geocodeAddress } from '../data/geocodingService'
import { preloadPlanForOffline } from '../offline/preload'
import { useOfflineSync } from '../hooks/useOfflineSync'
import type { CadastralParcel } from '../data/cadastreService'
import { boundsOfParcels, type SimpleLatLngBounds } from '../geometry/parcelBounds'
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
// Only for the ready-no-interior case, which renders <Toolbar /> — NOT a
// replacement for FLEX_COLUMN_FULL_HEIGHT_STYLE, which setting-origin still
// uses unpadded (it has no Toolbar).
const READY_NO_INTERIOR_STYLE = { ...FLEX_COLUMN_FULL_HEIGHT_STYLE, paddingTop: TOOLBAR_HEIGHT_PX }

type WorkspacePhase =
  | { name: 'creating-mission' }
  | { name: 'creating-exterior-plan'; mission: Mission }
  | { name: 'global-assessment'; mission: Mission; exteriorPlan: Plan }
  | { name: 'setting-origin'; mission: Mission; exteriorPlan: Plan; mapCenter: [number, number] }
  | { name: 'selecting-parcels'; mission: Mission; exteriorPlan: Plan }
  | { name: 'ready-no-interior'; mission: Mission; exteriorPlan: Plan; fitBounds?: SimpleLatLngBounds }
  | { name: 'calibrating-interior'; mission: Mission; exteriorPlan: Plan; imageUrl: string }
  | { name: 'error'; message: string }

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

type NonBlockingErrorAction = 'upload' | 'calibration' | 'assessment'

interface NonBlockingError {
  action: NonBlockingErrorAction
  message: string
}

const ACTION_LABELS: Record<NonBlockingErrorAction, string> = {
  upload: 'Import du plan intérieur : ',
  calibration: 'Calage du plan : ',
  assessment: 'Bilan global : ',
}

function NonBlockingErrorBanner({ error }: { error: NonBlockingError | null }) {
  if (!error) return null
  return (
    <p role="alert">
      {ACTION_LABELS[error.action]}
      {error.message}
    </p>
  )
}

export interface MissionWorkspaceProps {
  initialResumePhase?: ResumePhase
  onNavigateToMissionList: () => void
  onNavigateToNewMission: () => void
}

export function MissionWorkspace({
  initialResumePhase,
  onNavigateToMissionList,
  onNavigateToNewMission,
}: MissionWorkspaceProps) {
  const [phase, setPhase] = useState<WorkspacePhase>(
    initialResumePhase
      ? (initialResumePhase.name === 'setting-origin'
          ? { ...initialResumePhase, mapCenter: DEFAULT_CENTER } // resumed missions skip re-geocoding for now — a deliberate scope cut for this plan, not spec-mandated (spec §8 doesn't carve out an exception for the resume path); geocoding (Chunk 6) only runs on the fresh-creation path today
          : initialResumePhase)
      : { name: 'creating-mission' }
  )
  // Some MissionWorkspace failures still hard-fail to `phase: 'error'` (mission
  // creation, origin-setting, parcel confirmation, the FIRST global-assessment
  // save) — those happen before the terrain screen exists, so there's no
  // in-progress field work to preserve. The 3 actions below happen once the
  // terrain screen is already up; a failure there shouldn't cost the operator
  // their place.
  const [nonBlockingError, setNonBlockingError] = useState<NonBlockingError | null>(null)
  // Bumped as UndoRedoControls's onChanged (now that it lives in Toolbar,
  // outside SiteMapView) so SiteMapView's reloadKey prop can re-trigger its
  // internal loadAll() after a successful undo/redo.
  const [reloadKey, setReloadKey] = useState(0)
  // The DOM node Toolbar's "Ligne guide" toggle button exposes via its
  // onGuideLineSlotReady callback ref — null while the panel is closed (or
  // before Toolbar has mounted). Threaded down to SiteMapView, which portals
  // its guide-line control panel into it (the panel's state/handlers stay
  // local to SiteMapView; only WHERE the JSX renders moves).
  const [guideLineSlotEl, setGuideLineSlotEl] = useState<HTMLDivElement | null>(null)
  // Shared between Toolbar's UndoRedoControls instance (via its onBusyChange
  // prop) and MenuBar's Modifier menu, so Modifier's Annuler/Refaire disable
  // themselves while Toolbar's own Undo/Redo buttons are mid-operation —
  // see UndoRedoControls.tsx's onBusyChange doc comment for why this exists.
  const [undoRedoBusy, setUndoRedoBusy] = useState(false)
  // Independent instance from the one inside OfflineIndicator.tsx — not
  // currently shared via context/App.tsx. The hook's internal `flushingRef`
  // guard (useOfflineSync.ts) is per-hook-call-instance state, NOT shared
  // across the 2 independent useOfflineSync() call sites, so it does NOT
  // prevent this instance and OfflineIndicator's from both calling
  // flushPendingMutations() concurrently (e.g. both mounted and both firing
  // on the same 'online' event). flushPendingMutations() itself has no
  // concurrency guard either — this is the exact race useOfflineSync.ts's
  // own docstring already warns about (a losing concurrent flush can hit a
  // duplicate-key error from Supabase on a mutation the other already
  // replayed, leaving a phantom entry that fails forever on retry).
  // Accepted as a low-probability risk rather than solved here: it requires
  // near-simultaneous 'online' events or mount timing across both
  // components, and wiring a single shared instance through Context is
  // disproportionate scope for this task — consistent with how this
  // codebase already documents similar accepted concurrency risks elsewhere
  // (see actionHistory.ts's "Known limitation (accepted risk, not fixed)"
  // comment on undo/redo racing ordinary mutations). Only flushNow (for the
  // Fichier menu's "Enregistrer") is needed here.
  const { flushNow } = useOfflineSync()

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
      setPhase({ name: 'selecting-parcels', mission: updated, exteriorPlan: phase.exteriorPlan })
    } catch (err) {
      setPhase({ name: 'error', message: messageOf(err) })
    }
  }

  async function handleParcelsSelected(selectedParcels: CadastralParcel[]) {
    if (phase.name !== 'selecting-parcels') return
    try {
      const parcelIds = selectedParcels.map((p) => p.id)
      const updated = await setSelectedParcels(phase.mission.id, parcelIds)
      // Fire-and-forget: prime the offline caches in the background now that
      // parcels are confirmed, so the mission is ready to work with no
      // signal at the site. Preloading is best-effort — a failure here must
      // never block the mission from opening online, nor surface as an
      // unhandled rejection.
      preloadPlanForOffline(updated, phase.exteriorPlan).catch((err) =>
        console.warn('[offline] preload failed for mission', updated.id, err)
      )
      const fitBounds = boundsOfParcels(selectedParcels) ?? undefined
      setPhase({ name: 'ready-no-interior', mission: updated, exteriorPlan: phase.exteriorPlan, fitBounds })
    } catch (err) {
      setPhase({ name: 'error', message: messageOf(err) })
    }
  }

  async function handleInteriorFileChosen(file: File) {
    if (phase.name !== 'ready-no-interior') return
    setNonBlockingError(null)
    try {
      const url = await uploadPlanImage(phase.mission.id, file)
      setPhase({
        name: 'calibrating-interior',
        mission: phase.mission,
        exteriorPlan: phase.exteriorPlan,
        imageUrl: url,
      })
    } catch (err) {
      setNonBlockingError({ action: 'upload', message: messageOf(err) })
    }
  }

  async function handleInteriorCalibrated(calibration: AffineTransform) {
    if (phase.name !== 'calibrating-interior') return
    setNonBlockingError(null)
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
      setNonBlockingError({ action: 'calibration', message: messageOf(err) })
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

    case 'selecting-parcels': {
      const { originLat, originLng } = phase.mission
      return (
        <ParcelSelectionStep
          missionOrigin={{ lat: originLat!, lng: originLng! }}
          onConfirm={handleParcelsSelected}
        />
      )
    }

    case 'ready-no-interior': {
      // originLat/originLng are guaranteed non-null here: this phase is only
      // ever entered via setMissionOrigin's successful response (above) or
      // after returning from interior calibration (which requires having
      // passed through here first).
      const { originLat, originLng } = phase.mission
      return (
        <div style={READY_NO_INTERIOR_STYLE}>
          <Toolbar
            onGuideLineSlotReady={setGuideLineSlotEl}
            menuBar={
              <MenuBar
                onNavigateToMissionList={onNavigateToMissionList}
                onNavigateToNewMission={onNavigateToNewMission}
                missionInfo={{
                  address: phase.mission.address,
                  missionDate: phase.mission.missionDate,
                  parcelRefs: phase.mission.parcelRefs,
                }}
                onSaveNow={flushNow}
                onDuplicateMission={async () => {
                  await duplicateMission(phase.mission)
                  // Simplest correct behavior: land back on the list, showing
                  // the new duplicate — no separate "jump straight into the
                  // new mission" requirement was specified.
                  onNavigateToMissionList()
                }}
                onQuitMission={onNavigateToMissionList}
                planId={phase.exteriorPlan.id}
                undoRedoBusy={undoRedoBusy}
              />
            }
          >
            <UndoRedoControls
              planId={phase.exteriorPlan.id}
              onChanged={() => setReloadKey((k) => k + 1)}
              onBusyChange={setUndoRedoBusy}
            />
          </Toolbar>
          <NonBlockingErrorBanner error={nonBlockingError} />
          <div style={MAP_WRAPPER_STYLE}>
            <SiteMapView
              planId={phase.exteriorPlan.id}
              missionId={phase.mission.id}
              missionOrigin={{ lat: originLat!, lng: originLng! }}
              initialBuildingFootprint={phase.mission.buildingFootprint}
              fitBounds={phase.fitBounds}
              reloadKey={reloadKey}
              guideLineSlotEl={guideLineSlotEl}
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
              setNonBlockingError(null)
              try {
                const updated = await setGlobalAssessment(phase.mission.id, values)
                setPhase({ name: 'ready-no-interior', mission: updated, exteriorPlan: phase.exteriorPlan })
              } catch (err) {
                setNonBlockingError({ action: 'assessment', message: messageOf(err) })
              }
            }}
          />
        </div>
      )
    }

    case 'calibrating-interior':
      return (
        <>
          <NonBlockingErrorBanner error={nonBlockingError} />
          <PlanCalibrationTool
            imageUrl={phase.imageUrl}
            missionOrigin={{ lat: phase.mission.originLat!, lng: phase.mission.originLng! }}
            mapCenter={[phase.mission.originLat!, phase.mission.originLng!]}
            onCalibrated={handleInteriorCalibrated}
          />
        </>
      )

    case 'error':
      return <p role="alert">{phase.message}</p>
  }
}
