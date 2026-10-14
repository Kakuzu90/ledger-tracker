import { useEffect, useRef } from 'react'

/**
 * Lets a physical keyboard drive an on-screen keypad.
 *
 * Both keypads in the app — Quick Add's amount and the lock screen's PIN —
 * are grids of buttons with no text input behind them, so on a laptop or a
 * tablet with a keyboard the only way to enter ₱1,234.56 was seven pointer
 * presses. This maps the keys everyone already reaches for onto the same
 * handlers the buttons call.
 *
 * Presses are ignored while focus is in a field of its own, so typing a note
 * does not also punch digits into the amount.
 */
export function useKeypadKeys(options: {
  /** A digit, or `.` when the keypad takes one. */
  onKey: (key: string) => void
  onBackspace: () => void
  /** Enter / Return, where the keypad has something to submit to. */
  onSubmit?: () => void
  /** Accept `.` as well as the digits. */
  decimal?: boolean
  enabled?: boolean
}): void {
  const { decimal = false, enabled = true } = options

  // Held in a ref so the listener subscribes once per keypad rather than
  // once per keystroke: the callers pass fresh closures every render.
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      if (/^\d$/.test(event.key) || (decimal && (event.key === '.' || event.key === ','))) {
        event.preventDefault()
        latest.current.onKey(event.key === ',' ? '.' : event.key)
        return
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        latest.current.onBackspace()
        return
      }

      // Space and Enter belong to whatever button has focus.
      const submit = latest.current.onSubmit
      if (event.key === 'Enter' && submit && !(target instanceof HTMLButtonElement)) {
        event.preventDefault()
        submit()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [decimal, enabled])
}
