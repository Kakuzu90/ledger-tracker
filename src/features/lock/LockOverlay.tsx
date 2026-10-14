import { useCallback, useEffect, useState } from 'react'
import { LockIcon } from '@/ui/Icon'
import { cooldownText, PIN_MAX, secondsLeft } from '@/lib/pin'
import { describeError } from '@/lib/webauthn'
import { resetAllData } from '@/features/backup/db'
import { Keypad } from './components/Keypad'
import { openApp, tryBiometric, tryPin, useLockState } from './db'

/** The number of digits the dots show before they stop growing. */
const DOTS = 4

/**
 * The lock (design/Lock.dc.html). It renders instead of the app, not over
 * it: a screen reader, a scroll position or a devtools pane should not be
 * able to reach a ledger that is supposed to be shut.
 */
export function LockOverlay() {
  const state = useLockState()
  const [pin, setPin] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [now, setNow] = useState(() => new Date())

  const waiting = secondsLeft(state?.cooldownUntil, now)

  // A cooldown that only moved when something else re-rendered would sit
  // there looking permanent, so the screen counts it down out loud.
  useEffect(() => {
    if (state?.cooldownUntil === undefined) return
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [state?.cooldownUntil])

  const submit = useCallback(async (entered: string) => {
    setBusy(true)
    try {
      const result = await tryPin(entered)
      if (result.ok) return
      setPin('')
      setNow(new Date())
      setProblem(result.cooldown > 0 ? cooldownText(result.cooldown) : (result.problem ?? null))
    } finally {
      setBusy(false)
    }
  }, [])

  const onDigit = (digit: string) => {
    if (busy || waiting > 0) return
    setProblem(null)

    const next = `${pin}${digit}`.slice(0, PIN_MAX)
    setPin(next)
    // Four digits is the usual PIN, so it submits itself; a longer one is
    // sent with the tick that appears once there is more than that.
    if (next.length === DOTS) void submit(next)
  }

  const onBiometric = async () => {
    if (!state?.credential || busy) return
    setBusy(true)
    setProblem(null)
    try {
      const result = await tryBiometric(state.credential)
      if (!result.ok) setProblem(result.problem ?? null)
    } catch (error) {
      setProblem(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  // The state is still loading, or someone turned the lock off in another
  // tab. Either way there is nothing to ask for.
  useEffect(() => {
    if (state && (!state.enabled || !state.hasPin)) void openApp()
  }, [state])

  const filled = Math.max(pin.length, 0)
  const dots = Math.max(DOTS, filled)

  return (
    <div className="flex min-h-dvh flex-col items-center bg-lock px-6 pb-10 pt-[88px] text-lock-ink">
      <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-lock-tile text-lock-ink">
        <LockIcon size={30} />
      </div>
      <h1 className="mt-5 font-heading text-[24px]">Welcome back</h1>
      <p className="mt-1 text-sm text-lock-muted">
        {state?.biometrics ? 'Enter your PIN, or use your fingerprint' : 'Enter your PIN to unlock'}
      </p>

      <div
        role="status"
        aria-label={`${filled} of ${dots} digits entered`}
        className="mb-11 mt-8 flex gap-[18px]"
      >
        {Array.from({ length: dots }, (_, index) => (
          <span
            key={index}
            className={`h-3.5 w-3.5 rounded-full border-2 ${
              index < filled ? 'border-lock-ink bg-lock-ink' : 'border-lock-dot'
            }`}
          />
        ))}
      </div>

      <Keypad
        onDigit={onDigit}
        onDelete={() => {
          setProblem(null)
          setPin((current) => current.slice(0, -1))
        }}
        {...(state?.biometrics ? { onBiometric: () => void onBiometric() } : {})}
        disabled={busy || waiting > 0}
      />

      {/* Reserved whether or not there is a message, so the keypad does not
          jump the moment a PIN goes wrong. */}
      <p
        role="alert"
        className="mt-5 min-h-[20px] text-center text-sm text-lock-alert"
      >
        {waiting > 0 ? cooldownText(waiting) : problem}
      </p>

      {pin.length > DOTS && (
        <button
          type="button"
          className="btn-primary mt-3 w-full max-w-[300px]"
          disabled={busy || waiting > 0}
          onClick={() => void submit(pin)}
        >
          Unlock
        </button>
      )}

      <button
        type="button"
        onClick={() => setForgot(true)}
        className="mt-auto flex min-h-touch items-center text-sm text-lock-muted underline underline-offset-[3px]"
      >
        Forgot PIN? Restore from backup
      </button>

      {forgot && (
        <div className="fixed inset-0 z-10 flex flex-col justify-end bg-lock/80 p-5">
          <div className="rounded-card bg-surface p-5 text-ink">
            <h2 className="text-screen-sub">There is no way back in</h2>
            <p className="mt-2 text-meta text-muted">
              The PIN is not stored — only a one-way hash of it — so it cannot be
              looked up or reset from here. The way back is the backup file you
              exported: erase this device's data, then restore it on the empty app.
            </p>
            <p className="mt-2 text-meta text-muted">
              Without a backup file, erasing loses the ledger for good.
            </p>
            <button
              type="button"
              className="btn-secondary mt-4 w-full"
              onClick={() => setForgot(false)}
            >
              Keep trying
            </button>
            <button
              type="button"
              className="mt-2 min-h-[50px] w-full rounded-btn bg-negative font-semibold text-negative-ink"
              onClick={() => {
                void resetAllData().then(openApp)
              }}
            >
              Erase and start over
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
