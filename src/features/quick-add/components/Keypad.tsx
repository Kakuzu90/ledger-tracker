import { formatAmount } from '@/lib/money'
import type { TransactionType } from '@/db/types'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'] as const

function BackspaceIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 5H9l-6 7 6 7h12zM13 10l4 4M17 10l-4 4" />
    </svg>
  )
}

export function Keypad({ onPress }: { onPress: (key: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          aria-label={key === 'backspace' ? 'Backspace' : key}
          onClick={() => onPress(key)}
          className="flex min-h-[52px] items-center justify-center rounded-ctl bg-surface font-heading text-[22px] font-semibold text-ink active:bg-divider"
        >
          {key === 'backspace' ? <BackspaceIcon /> : key}
        </button>
      ))}
    </div>
  )
}

/**
 * The running total, with the centavos dimmed the way the mockup shows them.
 * Expenses read in the negative colour, income in the positive one.
 */
export function AmountDisplay({ input, type }: { input: string; type: TransactionType }) {
  const [whole = '', fraction] = input.split('.')
  const pesos = whole === '' ? '0' : whole
  const grouped = new Intl.NumberFormat('en-PH').format(Number(pesos))
  const centavos = (fraction ?? '').padEnd(2, '0').slice(0, 2)

  const tone =
    type === 'expense' ? 'text-negative' : type === 'income' ? 'text-primary' : 'text-ink'

  return (
    <div className="py-1 text-center">
      <p
        aria-hidden="true"
        className={`num m-0 text-[44px] font-bold tracking-[-.02em] ${tone}`}
      >
        ₱{grouped}
        <span className="text-muted">.{centavos}</span>
      </p>
      {/*
        `aria-label` on a paragraph is ignored by a good deal of assistive
        tech, and a keypad press changed nothing it would announce. Real
        text in a polite live region does both.
      */}
      <p role="status" className="sr-only">
        {`Amount ${formatAmount(Number(`${pesos}.${centavos}`) * 100)}`}
      </p>
    </div>
  )
}
