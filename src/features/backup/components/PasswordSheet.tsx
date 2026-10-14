import { useState } from 'react'
import { Sheet } from '@/ui/Sheet'

interface PasswordSheetProps {
  onClose: () => void
  /** "Password for this backup" / "Password for this file". */
  title: string
  hint: string
  /** Ask twice when the password is being chosen, once when it is being used. */
  confirm?: boolean
  action: string
  onSubmit: (password: string) => Promise<void>
}

/**
 * The password prompt, for writing and for reading an encrypted backup.
 * Mounted only while it is being asked, so a password never lingers in a
 * field between one use and the next.
 */
export function PasswordSheet({
  onClose,
  title,
  hint,
  confirm = false,
  action,
  onSubmit,
}: PasswordSheetProps) {
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (password === '') {
      setProblem('Enter a password')
      return
    }
    if (confirm && password !== again) {
      setProblem('The two passwords do not match')
      return
    }

    setBusy(true)
    setProblem(null)
    try {
      await onSubmit(password)
      setPassword('')
      setAgain('')
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
        <span className="label">Password</span>
        <input
          className="field mt-1"
          type="password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {confirm && (
        <label className="block">
          <span className="label">Password again</span>
          <input
            className="field mt-1"
            type="password"
            value={again}
            onChange={(event) => setAgain(event.target.value)}
          />
        </label>
      )}

      {problem && <p className="text-meta text-negative">{problem}</p>}

      <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => void submit()}>
        {busy ? 'Working…' : action}
      </button>
    </Sheet>
  )
}
