import type { Recurring, Transaction } from '@/db/types'
import { formatMoney } from '@/lib/money'
import { relativeDay } from '@/lib/dates'
import { RepeatIcon } from '@/ui/Icon'

interface PendingRecurringProps {
  transaction: Transaction
  rule?: Recurring
  today: Date
  onConfirm: () => void
  onSkip: () => void
}

/**
 * A recurring entry waiting on a yes. It sits above the list, dashed, so it
 * reads as something still to decide rather than something that happened.
 */
export function PendingRecurring({
  transaction,
  rule,
  today,
  onConfirm,
  onSkip,
}: PendingRecurringProps) {
  const when = relativeDay(transaction.date, today).toLowerCase()

  return (
    <div className="flex items-center gap-2.5 rounded-[16px] border border-dashed border-border-strong bg-surface px-3 py-2.5">
      <span className="text-muted">
        <RepeatIcon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {transaction.note} · {formatMoney(transaction.amount, { compact: true })}
        </p>
        <p className="text-meta text-muted">
          {rule ? 'Recurring' : 'Pending'} · due {when}
        </p>
      </div>
      <button
        type="button"
        onClick={onSkip}
        className="min-h-touch px-2.5 text-sm font-medium text-muted"
      >
        Skip
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className="min-h-touch rounded-ctl bg-primary px-3.5 text-sm font-semibold text-primary-ink"
      >
        Confirm
      </button>
    </div>
  )
}
