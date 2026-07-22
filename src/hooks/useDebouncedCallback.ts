import { useCallback, useEffect, useRef } from 'react'

// Generic debounce for auto-save-on-change UI (spec §7: the global-assessment
// bar auto-saves per slider change, but must not fire a network call on
// every intermediate drag value — only once the user settles).
export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number
): (...args: Args) => void {
  const fnRef = useRef(fn)
  fnRef.current = fn
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
  }, [])

  return useCallback((...args: Args) => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => fnRef.current(...args), delayMs)
  }, [delayMs])
}
