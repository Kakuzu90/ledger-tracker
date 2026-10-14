import { formatMoney, HIDDEN_AMOUNT } from '@/lib/money'
import type { Centavos } from '@/db/types'
import { useUIStore } from '@/store/ui'

type Tone = 'auto' | 'plain' | 'positive' | 'negative'

interface MoneyProps {
  /** Signed for display: pass −amount for an expense row. */
  value: Centavos
  /** Colour by sign, or force one. */
  tone?: Tone
  /** Show a leading + on positives. */
  signed?: boolean
  /** Drop the centavos when the amount is whole. */
  compact?: boolean
  /** Round to whole pesos — for balances too big to care about centavos. */
  whole?: boolean
  className?: string
}

const toneClass = (tone: Tone, value: Centavos): string => {
  if (tone === 'plain') return ''
  if (tone === 'positive') return 'text-primary'
  if (tone === 'negative') return 'text-negative'
  if (value < 0) return 'text-negative'
  if (value > 0) return 'text-primary'
  return ''
}

/**
 * Every amount on screen goes through here, so the "hide amounts" toggle in
 * the home header covers all of them.
 */
export function Money({
  value,
  tone = 'plain',
  signed = false,
  compact = false,
  whole = false,
  className = '',
}: MoneyProps) {
  const hidden = useUIStore((s) => s.amountsHidden)
  const classes = `num ${toneClass(tone, value)} ${className}`.trim()

  if (hidden) {
    return (
      <span className={classes} aria-label="Amount hidden">
        {HIDDEN_AMOUNT}
      </span>
    )
  }

  const amount = whole ? Math.round(value / 100) * 100 : value
  return (
    <span className={classes}>
      {formatMoney(amount, { signed, compact: compact || whole })}
    </span>
  )
}
