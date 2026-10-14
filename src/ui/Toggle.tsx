import { useId, type ReactNode } from 'react'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  /** Second line under the label. */
  hint?: ReactNode
  /** Leading icon tile, as on the backup screen. */
  icon?: ReactNode
  /** Greyed out, with the switch inert — a toggle that cannot apply yet. */
  disabled?: boolean
}

/** The switch row from the mockups (`.row` + `.sw`). */
export function Toggle({ checked, onChange, label, hint, icon, disabled = false }: ToggleProps) {
  const hintId = useId()

  return (
    <div className="flex min-h-[56px] items-center justify-between gap-3 border-b border-divider last:border-b-0">
      {icon && (
        <span
          aria-hidden="true"
          className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-ctl bg-divider text-muted"
        >
          {icon}
        </span>
      )}
      <div className={`min-w-0 flex-1 ${disabled ? 'opacity-50' : ''}`}>
        <p className="font-medium">{label}</p>
        {hint && (
          <p id={hintId} className="text-meta text-muted">
            {hint}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        {...(hint ? { 'aria-describedby': hintId } : {})}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        // The 28px track is the mockup's; the hit area is padded out to 44
        // with a pseudo-element so the switch looks the same and is still
        // comfortable to hit.
        className={`relative h-7 w-[46px] flex-none rounded-full transition-colors before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] disabled:opacity-50 ${
          checked ? 'bg-primary' : 'bg-border-strong'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-surface transition-[left] ${
            checked ? 'left-[21px]' : 'left-[3px]'
          }`}
        />
      </button>
    </div>
  )
}
