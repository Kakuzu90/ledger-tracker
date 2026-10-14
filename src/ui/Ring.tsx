import { clampShare, formatPercent } from '@/lib/money'

interface RingProps {
  /** 0–1. Clamped, so a reached goal draws a full circle and no more. */
  value: number
  color?: string
  size?: number
  label?: string
  className?: string
}

/**
 * The progress ring on a savings goal. An SVG circle rather than a chart:
 * it is one number, and Recharts would cost a ResponsiveContainer per tile.
 */
export function Ring({
  value,
  color = 'rgb(var(--c-primary))',
  size = 64,
  label,
  className = '',
}: RingProps) {
  const share = clampShare(value)
  const radius = size / 2 - 6
  const circumference = 2 * Math.PI * radius
  const text = label ?? formatPercent(share)

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${text} saved`}
      className={`block ${className}`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="rgb(var(--c-divider))"
        strokeWidth={8}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={8}
        strokeDasharray={`${circumference * share} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2}
        y={size / 2 + 5}
        textAnchor="middle"
        className="num fill-ink text-sm font-bold [stroke:none]"
      >
        {text}
      </text>
    </svg>
  )
}
