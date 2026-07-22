import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedCallback } from './useDebouncedCallback'

describe('useDebouncedCallback', () => {
  it('only calls the underlying function once after the delay, with the LAST args, given rapid repeated calls', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(fn, 500))

    act(() => {
      result.current(1)
      result.current(2)
      result.current(3)
    })
    expect(fn).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(500))
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(3)

    vi.useRealTimers()
  })
})
