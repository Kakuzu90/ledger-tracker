import { clampShare } from '@/lib/money'

interface MeterProps {
  /** 0–1. Values outside the range are clamped. */
  value: number
  /** Override the fill colour, e.g. for an over-budget bar. */
  color?: string
  className?: string
}

/** The progress bar used by budgets and loans. */
export function Meter({ value, color, className = '' }: MeterProps) {
  const share = clampShare(value)
  return (
    <div
      className={`meter ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(share * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <i style={{ width: `${share * 100}%`, ...(color ? { background: color } : {}) }} />
    </div>
  )
}
