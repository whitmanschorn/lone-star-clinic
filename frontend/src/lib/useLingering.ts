import { useEffect, useRef, useState } from 'react'

/**
 * True while `active` is true, and for at least `minimumMs` after it turned
 * true. A background refresh often finishes in a few milliseconds; without
 * this its indicator would be an unreadable flicker.
 */
export function useLingering(active: boolean, minimumMs = 500): boolean {
  const [lingering, setLingering] = useState(false)
  const stopTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(stopTimer.current), [])

  useEffect(() => {
    if (!active) return
    const startTimer = setTimeout(() => setLingering(true), 0)
    // Deliberately not cancelled when `active` turns false: it is what keeps
    // the indicator up for the minimum time.
    clearTimeout(stopTimer.current)
    stopTimer.current = setTimeout(() => setLingering(false), minimumMs)
    return () => clearTimeout(startTimer)
  }, [active, minimumMs])

  return active || lingering
}
