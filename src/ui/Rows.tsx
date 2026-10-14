import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRightIcon } from './Icon'

/** The white rounded group the settings and backup mockups list rows in. */
export function RowGroup({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-card border border-border bg-surface px-4 ${className}`}>
      {children}
    </div>
  )
}

interface RowProps {
  label: ReactNode
  /** Second line, in muted ink. */
  hint?: ReactNode
  /** Right-hand side: a value, a badge, a control. */
  value?: ReactNode
  /** Leading icon tile. */
  icon?: ReactNode
  to?: string
  onClick?: () => void
  /** Links and buttons get the chevron unless told otherwise. */
  chevron?: boolean
  /** Prints the value in warning ink — a backup that is overdue. */
  alert?: boolean
  disabled?: boolean
}

const BODY = 'flex min-h-[56px] w-full items-center gap-3 border-b border-divider text-left last:border-b-0'

function Body({ label, hint, value, icon, chevron, alert }: RowProps) {
  return (
    <>
      {icon && (
        <span
          aria-hidden="true"
          className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-ctl bg-divider text-muted"
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-meta text-muted">{hint}</span>}
      </span>
      {value !== undefined && (
        <span
          className={`flex flex-none items-center gap-1 text-sm ${
            alert ? 'text-negative' : 'text-muted'
          }`}
        >
          {value}
        </span>
      )}
      {chevron && <ChevronRightIcon size={16} className="flex-none text-muted" />}
    </>
  )
}

/**
 * One row of a group. A `to` makes it a link, an `onClick` a button, and
 * neither leaves it as a line of information.
 */
export function Row(props: RowProps) {
  const { to, onClick, disabled } = props
  const chevron = props.chevron ?? (to !== undefined || onClick !== undefined)
  const body = <Body {...props} chevron={chevron} />

  if (to !== undefined) {
    return (
      <Link to={to} className={`${BODY} text-ink no-underline`}>
        {body}
      </Link>
    )
  }

  if (onClick !== undefined) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={`${BODY} disabled:opacity-50`}>
        {body}
      </button>
    )
  }

  return <div className={BODY}>{body}</div>
}

type BadgeTone = 'neutral' | 'positive' | 'negative'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-divider text-muted',
  positive: 'bg-primary-soft text-primary',
  negative: 'bg-negative-soft text-negative',
}

/** The small pill the mockups use for "Later", "Granted" and the like. */
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: BadgeTone
}) {
  return (
    <span
      className={`inline-flex min-h-[22px] items-center rounded-full px-2 text-label ${TONES[tone]}`}
    >
      {children}
    </span>
  )
}
