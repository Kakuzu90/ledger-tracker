interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  /** Second line under the label. */
  hint?: string
}

/** The switch row from the mockups (`.row` + `.sw`). */
export function Toggle({ checked, onChange, label, hint }: ToggleProps) {
  return (
    <div className="flex min-h-[56px] items-center justify-between gap-3 border-b border-divider last:border-b-0">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        {hint && <p className="text-meta text-muted">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-[46px] flex-none rounded-full transition-colors ${
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
