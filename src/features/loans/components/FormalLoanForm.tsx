import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Account, Loan, RateBasis } from '@/db/types'
import { Sheet } from '@/ui/Sheet'
import { Chip } from '@/ui/Chip'
import { formatAmount, parseMoney } from '@/lib/money'
import { useUIStore } from '@/store/ui'
import { fromAnnualRate, toAnnualRate } from '@/lib/loans'
import { monthlyPayment } from '@/lib/amortization'
import { deleteLoan, updateLoan, type LoanDraft } from '../db'
import { RateField } from './RateField'

interface FormalLoanFormProps {
  open: boolean
  onClose: () => void
  loan: Loan
  accounts: readonly Account[]
  /** Instalments logged against it; a loan with any cannot be deleted. */
  paidCount: number
}

const toDraft = (loan: Loan): LoanDraft => ({
  kind: 'formal',
  direction: loan.direction,
  principal: loan.principal,
  startDate: loan.startDate,
  note: loan.note,
  ...(loan.lender ? { lender: loan.lender } : {}),
  ...(loan.ratePct !== undefined ? { ratePct: loan.ratePct } : {}),
  ...(loan.rateBasis !== undefined ? { rateBasis: loan.rateBasis } : {}),
  ...(loan.termMonths !== undefined ? { termMonths: loan.termMonths } : {}),
  ...(loan.monthlyPayment !== undefined ? { monthlyPayment: loan.monthlyPayment } : {}),
  ...(loan.accountId ? { accountId: loan.accountId } : {}),
})

/** Editing an existing formal loan, from the pencil on its detail screen. */
export function FormalLoanForm(props: FormalLoanFormProps) {
  return props.open ? <Form key={props.loan.updatedAt} {...props} /> : null
}

function Form({ onClose, loan, accounts, paidCount }: FormalLoanFormProps) {
  const navigate = useNavigate()
  const showSnack = useUIStore((s) => s.showSnack)
  const [draft, setDraft] = useState<LoanDraft>(() => toDraft(loan))
  // The rate is held as typed, in the unit it was quoted in; `draft`
  // carries the annual figure the schedule needs.
  const [basis, setBasis] = useState<RateBasis>(loan.rateBasis ?? 'year')
  const [rate, setRate] = useState(() =>
    loan.ratePct === undefined
      ? ''
      : String(fromAnnualRate(loan.ratePct, loan.rateBasis ?? 'year')),
  )
  // Held as typed so the field can be emptied back to "work it out for me",
  // which a number alone cannot express.
  const [payment, setPayment] = useState(() =>
    loan.monthlyPayment === undefined ? '' : formatAmount(loan.monthlyPayment),
  )
  const [problem, setProblem] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const live = accounts.filter((account) => !account.archived || account.id === loan.accountId)
  const update = (patch: Partial<LoanDraft>) => setDraft((current) => ({ ...current, ...patch }))
  const computed = monthlyPayment(draft.principal, draft.ratePct ?? 0, draft.termMonths ?? 0)

  const number = (raw: string): number | undefined => {
    if (raw.trim() === '') return undefined
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0 ? value : undefined
  }

  const onSave = async () => {
    try {
      await updateLoan(loan.id, draft)
      onClose()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not save that')
    }
  }

  const onDelete = async () => {
    try {
      await deleteLoan(loan.id)
      onClose()
      showSnack({ message: 'Loan removed' })
      navigate('/loans', { replace: true })
    } catch (error) {
      setConfirming(false)
      setProblem(error instanceof Error ? error.message : 'Could not remove that')
    }
  }

  // `deleteLoan` refuses this anyway. Saying so here means finding out by
  // reading rather than by tapping a button and watching nothing happen.
  const locked = paidCount > 0

  return (
    <Sheet open onClose={onClose} title="Edit loan">
      <label className="block">
        <span className="label">Name</span>
        <input
          className="field mt-1"
          value={draft.note}
          onChange={(event) => update({ note: event.target.value })}
          placeholder="Car loan"
        />
      </label>

      <label className="block">
        <span className="label">Lender</span>
        <input
          className="field mt-1"
          value={draft.lender ?? ''}
          onChange={(event) => update({ lender: event.target.value })}
          placeholder="BDO"
        />
      </label>

      <label className="block">
        <span className="label">Amount borrowed</span>
        <input
          className="field mt-1"
          type="text"
          inputMode="decimal"
          defaultValue={formatAmount(draft.principal)}
          onChange={(event) => update({ principal: parseMoney(event.target.value) ?? 0 })}
        />
      </label>

      <div className="flex gap-3">
        <div className="flex-1">
          <RateField
            rate={rate}
            basis={basis}
            onRate={(next) => {
              setRate(next)
              update({ ratePct: toAnnualRate(number(next) ?? 0, basis) })
            }}
            onBasis={(next) => {
              setBasis(next)
              // The typed number means a different annual rate under the
              // other unit; the number stays, what it stands for changes.
              update({ rateBasis: next, ratePct: toAnnualRate(number(rate) ?? 0, next) })
            }}
          />
        </div>
        <label className="flex-1">
          <span className="label">Term, months</span>
          <input
            className="field mt-1"
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={draft.termMonths ?? ''}
            onChange={(event) => update({ termMonths: number(event.target.value) ?? 0 })}
            placeholder="60"
          />
        </label>
      </div>

      <label className="block">
        <span className="label">Monthly payment · optional</span>
        <input
          className="field mt-1"
          type="text"
          inputMode="decimal"
          value={payment}
          onChange={(event) => {
            setPayment(event.target.value)
            const amount = parseMoney(event.target.value)
            // Dexie's `update` deletes a key set to undefined, which is
            // exactly what clearing the field should do.
            update({ monthlyPayment: amount && amount > 0 ? amount : undefined })
          }}
          placeholder={computed > 0 ? formatAmount(computed) : '0.00'}
          aria-describedby="edit-payment-hint"
        />
        <span id="edit-payment-hint" className="mt-1 block text-meta text-muted">
          What the lender actually bills. Clear it to go back to the figure worked out
          from the rate and term.
        </span>
      </label>

      <label className="block">
        <span className="label">First payment</span>
        <input
          className="field mt-1"
          type="date"
          value={draft.startDate}
          onChange={(event) => update({ startDate: event.target.value })}
        />
        <span className="mt-1 block text-meta text-muted">
          Instalment 1 falls on this date, and the rest follow a month apart.
        </span>
      </label>

      <div>
        <span className="label">Pay it from</span>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {live.map((account) => (
            <Chip
              key={account.id}
              active={account.id === draft.accountId}
              dot={account.color}
              onClick={() => update({ accountId: account.id })}
            >
              {account.name}
            </Chip>
          ))}
        </div>
      </div>

      {problem && (
        <p role="alert" className="text-center text-meta text-negative">
          {problem}
        </p>
      )}

      <button type="button" className="btn-primary w-full" onClick={() => void onSave()}>
        Save changes
      </button>

      {locked ? (
        <div className="rounded-ctl border border-border bg-bg p-3.5">
          <p className="text-meta font-medium text-ink">This loan cannot be deleted</p>
          <p className="mt-1 text-meta text-muted">
            {paidCount} {paidCount === 1 ? 'payment has' : 'payments have'} been recorded
            against it. Settle it instead, so what you paid stays in the ledger — or
            undo them one at a time from the schedule.
          </p>

        </div>
      ) : confirming ? (
        <div role="alertdialog" aria-label="Delete this loan?">
          <p className="text-meta font-medium text-negative">Delete this loan?</p>
          <p className="mt-1 text-meta text-muted">
            The loan and anything it posted to your accounts go. This cannot be undone.
          </p>
          <button
            type="button"
            className="btn-secondary mt-3 w-full"
            onClick={() => setConfirming(false)}
          >
            Keep it
          </button>
          <button
            type="button"
            className="mt-2 min-h-[50px] w-full rounded-btn bg-negative font-semibold text-negative-ink"
            onClick={() => void onDelete()}
          >
            Yes, delete it
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn-secondary w-full !text-negative"
          onClick={() => setConfirming(true)}
        >
          Delete loan
        </button>
      )}
    </Sheet>
  )
}
