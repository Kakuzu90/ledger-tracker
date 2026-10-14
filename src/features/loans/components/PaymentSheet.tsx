import { useState } from 'react'
import { Sheet } from '@/ui/Sheet'
import { Chip } from '@/ui/Chip'
import { Money } from '@/ui/Money'
import { formatAmount, parseMoney } from '@/lib/money'
import { toDateOnly } from '@/lib/dates'
import type { Account, Id } from '@/db/types'
import { useUIStore } from '@/store/ui'
import { deletePayment, recordPayment } from '../db'
import type { LoanCard } from '../person'

interface PaymentSheetProps {
  open: boolean
  onClose: () => void
  /** The open loans this payment can go against. */
  loans: readonly LoanCard[]
  accounts: readonly Account[]
  /** Pre-selected loan, when the user tapped one in particular. */
  loanId?: Id
}

/**
 * Records a partial or full repayment. Remounted per opening so the amount
 * never carries over from the last one.
 */
export function PaymentSheet(props: PaymentSheetProps) {
  return props.open ? <Form key={props.loanId ?? 'first'} {...props} /> : null
}

function Form({ onClose, loans, accounts, loanId }: PaymentSheetProps) {
  const showSnack = useUIStore((s) => s.showSnack)
  const live = accounts.filter((account) => !account.archived)

  const [selectedId, setSelectedId] = useState<Id | undefined>(
    loanId ?? loans[0]?.loan.id,
  )
  const selected = loans.find((row) => row.loan.id === selectedId) ?? loans[0]

  // Paying off what is left is the common case, so it is what the field opens on.
  const [amountInput, setAmountInput] = useState(() =>
    selected ? formatAmount(selected.outstanding) : '',
  )
  const [accountId, setAccountId] = useState<Id | undefined>(
    selected?.loan.accountId ?? live[0]?.id,
  )
  const [date, setDate] = useState(toDateOnly(new Date()))
  const [problem, setProblem] = useState<string | null>(null)

  const pickLoan = (row: LoanCard) => {
    setSelectedId(row.loan.id)
    setAmountInput(formatAmount(row.outstanding))
  }

  const amount = parseMoney(amountInput) ?? 0
  const received = selected?.loan.direction === 'lent'

  const onSave = async () => {
    if (!selected || !accountId) {
      setProblem('Choose an account for the money')
      return
    }

    try {
      const paymentId = await recordPayment({
        loanId: selected.loan.id,
        amount,
        date,
        accountId,
      })
      onClose()
      showSnack({
        message: amount >= selected.outstanding ? 'Loan settled' : 'Payment recorded',
        actionLabel: 'Undo',
        onAction: () => deletePayment(paymentId),
      })
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not record that')
    }
  }

  return (
    <Sheet open onClose={onClose} title="Record payment">
      {loans.length > 1 && (
        <div>
          <span className="label">Against</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {loans.map((row) => (
              <Chip
                key={row.loan.id}
                active={row.loan.id === selected?.loan.id}
                onClick={() => pickLoan(row)}
              >
                {row.loan.note || 'Loan'}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <p className="text-meta text-muted">
          <Money value={selected.outstanding} compact className="font-semibold text-ink" /> still
          owed on {selected.loan.note || 'this loan'}
        </p>
      )}

      <label className="block">
        <span className="label">{received ? 'Amount received' : 'Amount paid'}</span>
        <input
          className="field mt-1 font-heading text-2xl font-bold"
          type="text"
          inputMode="decimal"
          value={amountInput}
          onChange={(event) => setAmountInput(event.target.value)}
          placeholder="0.00"
          autoFocus
        />
      </label>

      <div>
        <span className="label">{received ? 'Into' : 'From'}</span>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {live.map((account) => (
            <Chip
              key={account.id}
              active={account.id === accountId}
              dot={account.color}
              onClick={() => setAccountId(account.id)}
            >
              {account.name}
            </Chip>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="label">Date</span>
        <input
          className="field mt-1"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>

      <p className="text-meta text-muted">
        This also adds {received ? 'income to' : 'an expense on'}{' '}
        {live.find((account) => account.id === accountId)?.name ?? 'the account'}.
      </p>

      {problem && (
        <p role="alert" className="text-center text-meta text-negative">
          {problem}
        </p>
      )}

      <button
        type="button"
        className="btn-primary w-full disabled:opacity-50"
        disabled={amount <= 0}
        onClick={() => void onSave()}
      >
        Record payment
      </button>
    </Sheet>
  )
}
