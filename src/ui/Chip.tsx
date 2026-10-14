import type { ReactNode } from 'react'

interface ChipProps {
  children: ReactNode
  /** Filled dark state, for the selected chip. */
  active?: boolean
  /** Colour dot before the label, for categories. */
  dot?: string
  onClick?: () => void
  'aria-label'?: string
}

export function Chip({ children, active = false, dot, onClick, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={onClick ? active : undefined}
      onClick={onClick}
      className={`chip ${active ? 'chip-on' : ''}`}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 flex-none rounded-full"
          style={{ backgroundColor: dot }}
        />
      )}
      {children}
    </button>
  )
}
