import { useState } from 'react'
import { Sheet } from '@/ui/Sheet'
import { checkPin, PIN_MAX, PIN_MIN } from '@/lib/pin'

interface PinSheetProps {
  onClose: () => void
  title: string
  hint: string
  action: string
  /** Choosing a new PIN: ask twice, and hold it to the rules. */
  choosing?: boolean
  onSubmit: (pin: string) => Promise<void>
}

const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, PIN_MAX)

/**
 * Setting a PIN, and proving you know the current one.
 *
 * Mounted only while it is being asked, so a PIN never sits in a field
 * between one use and the next.
 */
export function PinSheet({
  onClose,
  title,
  hint,
  action,
  choosing = false,
  onSubmit,
}: PinSheetProps) {
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const rules = choosing ? checkPin(pin) : pin.length < PIN_MIN ? 'Enter your PIN' : null
    if (rules) {
      setProblem(rules)
      return
    }
    if (choosing && pin !== again) {
      setProblem('The two PINs do not match')
      return
    }

    setBusy(true)
    setProblem(null)
    try {
      await onSubmit(pin)
      onClose()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That did not work')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={title}>
      <p className="text-meta text-muted">{hint}</p>

      <label className="block">
        <span className="label">{choosing ? 'New PIN' : 'PIN'}</span>
        <input
          className="field mt-1 tracking-[.4em]"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={pin}
          onChange={(event) => setPin(digitsOnly(event.target.value))}
        />
      </label>

      {choosing && (
        <label className="block">
          <span className="label">PIN again</span>
          <input
            className="field mt-1 tracking-[.4em]"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={again}
            onChange={(event) => setAgain(digitsOnly(event.target.value))}
          />
        </label>
      )}

      {choosing && (
        <p className="text-meta text-muted">
          {PIN_MIN} to {PIN_MAX} digits. It is stored as a one-way hash, so it
          cannot be looked up or reset — if you forget it, the way back in is a
          backup file.
        </p>
      )}

      {problem && <p className="text-meta text-negative">{problem}</p>}

      <button
        type="button"
        className="btn-primary w-full"
        disabled={busy}
        onClick={() => void submit()}
      >
        {busy ? 'Working…' : action}
      </button>
    </Sheet>
  )
}
