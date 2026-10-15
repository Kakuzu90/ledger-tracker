import { clampShare } from '@/lib/money'

interface MeterProps {
  /** 0–1. Values outside the range are clamped. */
  value: number
  /** Override the fill colour, e.g. for an over-budget bar. */
  color?: string
  /** What the bar is measuring — a progressbar with no name announces none. */
  label?: string
  className?: string
}

/** The progress bar used by budgets and loans. */
export function Meter({ value, color, label, className = '' }: MeterProps) {
  const share = clampShare(value)
  return (
    <div
      className={`meter ${className}`}
      // Every meter in the app sits beside text that already gives the
      // figures. Announcing an unnamed progressbar as well is noise, so the
      // bar is only exposed when it is given something to be called.
      {...(label
        ? {
            role: 'progressbar',
            'aria-label': label,
            'aria-valuenow': Math.round(share * 100),
            'aria-valuemin': 0,
            'aria-valuemax': 100,
          }
        : { 'aria-hidden': true })}
    >
      <i style={{ width: `${share * 100}%`, ...(color ? { background: color } : {}) }} />
    </div>
  )
}
