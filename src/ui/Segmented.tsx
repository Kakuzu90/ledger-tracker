interface SegmentedProps<T extends string> {
  label: string
  options: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}

/** The pill segmented control from the mockups (`.seg`). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-ctl bg-divider p-1">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`min-h-touch flex-1 rounded-[9px] text-sm font-medium transition-colors ${
              active ? 'bg-surface text-ink shadow-sm' : 'text-muted'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
