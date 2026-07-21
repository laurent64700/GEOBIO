import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlanCalibrationTool, clientPositionToNaturalImagePoint } from './PlanCalibrationTool'
import { calibratePlan, CalibrationError } from '../geometry/calibration'

describe('clientPositionToNaturalImagePoint', () => {
  it('scales a displayed-size click position up to the natural image size', () => {
    const point = clientPositionToNaturalImagePoint(
      { naturalWidth: 800, naturalHeight: 600 },
      { left: 10, top: 20, width: 400, height: 300 },
      { x: 210, y: 170 }
    )
    // displayed at half natural size (400/800, 300/600) -> scale factor 2 on both axes
    expect(point).toEqual({ x: 400, y: 300 })
  })
})

vi.mock('../geometry/calibration', async () => {
  const actual = await vi.importActual<typeof import('../geometry/calibration')>(
    '../geometry/calibration'
  )
  return { ...actual, calibratePlan: vi.fn() }
})

vi.mock('./MapView', () => ({
  // Real map interaction is already covered by MapView's own tests (Task 13) —
  // here, a click always reports the same fixed point, since the exact
  // real-world value doesn't matter once calibratePlan is mocked.
  MapView: ({ onMapClick }: { onMapClick?: (latlng: { lat: number; lng: number }) => void }) => (
    <button onClick={() => onMapClick?.({ lat: 48.8566, lng: 2.3522 })}>simulate-map-click</button>
  ),
}))

function setupImage(img: HTMLImageElement) {
  Object.defineProperty(img, 'naturalWidth', { value: 800, configurable: true })
  Object.defineProperty(img, 'naturalHeight', { value: 600, configurable: true })
  vi.spyOn(img, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON() {},
  } as DOMRect)
}

function placeOneControlPoint(img: HTMLImageElement, clientX = 0, clientY = 0) {
  fireEvent.click(img, { clientX, clientY })
  fireEvent.click(screen.getByText('simulate-map-click'))
}

describe('PlanCalibrationTool', () => {
  beforeEach(() => {
    vi.mocked(calibratePlan).mockReset()
  })

  it('collects an image click followed by a map click as one control point', () => {
    render(
      <PlanCalibrationTool
        imageUrl="https://example.com/plan.jpg"
        missionOrigin={{ lat: 48.8566, lng: 2.3522 }}
        mapCenter={[48.8566, 2.3522]}
        onCalibrated={vi.fn()}
      />
    )
    const img = screen.getByAltText('Plan intérieur à caler') as HTMLImageElement
    setupImage(img)

    fireEvent.click(img, { clientX: 200, clientY: 150 })
    expect(screen.getByText(/cliquez maintenant sur la carte/i)).toBeInTheDocument()

    fireEvent.click(screen.getByText('simulate-map-click'))
    expect(screen.getByText(/1 point\(s\) posé/)).toBeInTheDocument()
  })

  it('disables validation until at least 2 points are collected', () => {
    render(
      <PlanCalibrationTool
        imageUrl="https://example.com/plan.jpg"
        missionOrigin={{ lat: 48.8566, lng: 2.3522 }}
        mapCenter={[48.8566, 2.3522]}
        onCalibrated={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /valider le calage/i })).toBeDisabled()
  })

  it('ignores further image clicks once 4 control points are collected (spec cap)', () => {
    render(
      <PlanCalibrationTool
        imageUrl="https://example.com/plan.jpg"
        missionOrigin={{ lat: 48.8566, lng: 2.3522 }}
        mapCenter={[48.8566, 2.3522]}
        onCalibrated={vi.fn()}
      />
    )
    const img = screen.getByAltText('Plan intérieur à caler') as HTMLImageElement
    setupImage(img)

    for (let i = 0; i < 4; i++) placeOneControlPoint(img, i, i)
    expect(screen.getByText(/maximum de 4 points atteint/i)).toBeInTheDocument()

    placeOneControlPoint(img, 99, 99) // should be ignored — already at the cap
    expect(screen.getByText(/maximum de 4 points atteint/i)).toBeInTheDocument()
    expect(screen.queryByText(/5 point\(s\) posé/)).not.toBeInTheDocument()
  })

  it('calls onCalibrated with the fitted transform once validated with 2+ points', () => {
    const fakeTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
    vi.mocked(calibratePlan).mockReturnValue(fakeTransform)
    const onCalibrated = vi.fn()
    render(
      <PlanCalibrationTool
        imageUrl="https://example.com/plan.jpg"
        missionOrigin={{ lat: 0, lng: 0 }}
        mapCenter={[0, 0]}
        onCalibrated={onCalibrated}
      />
    )
    const img = screen.getByAltText('Plan intérieur à caler') as HTMLImageElement
    setupImage(img)

    placeOneControlPoint(img, 0, 0)
    placeOneControlPoint(img, 400, 0)

    fireEvent.click(screen.getByRole('button', { name: /valider le calage/i }))
    expect(onCalibrated).toHaveBeenCalledWith(fakeTransform)
  })

  it('removes the last collected point when the undo button is clicked', () => {
    render(
      <PlanCalibrationTool
        imageUrl="https://example.com/plan.jpg"
        missionOrigin={{ lat: 48.8566, lng: 2.3522 }}
        mapCenter={[48.8566, 2.3522]}
        onCalibrated={vi.fn()}
      />
    )
    const img = screen.getByAltText('Plan intérieur à caler') as HTMLImageElement
    setupImage(img)

    placeOneControlPoint(img, 0, 0)
    placeOneControlPoint(img, 10, 10)
    expect(screen.getByText(/2 point\(s\) posé/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /retirer le dernier point/i }))
    expect(screen.getByText(/1 point\(s\) posé/)).toBeInTheDocument()
  })

  it('shows the CalibrationError message and does not call onCalibrated when validation fails', () => {
    vi.mocked(calibratePlan).mockImplementation(() => {
      throw new CalibrationError('Les points de contrôle 1 et 2 sont trop proches.')
    })
    const onCalibrated = vi.fn()
    render(
      <PlanCalibrationTool
        imageUrl="https://example.com/plan.jpg"
        missionOrigin={{ lat: 0, lng: 0 }}
        mapCenter={[0, 0]}
        onCalibrated={onCalibrated}
      />
    )
    const img = screen.getByAltText('Plan intérieur à caler') as HTMLImageElement
    setupImage(img)

    placeOneControlPoint(img, 0, 0)
    placeOneControlPoint(img, 10, 10)
    fireEvent.click(screen.getByRole('button', { name: /valider le calage/i }))

    expect(onCalibrated).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('trop proches')
  })
})
