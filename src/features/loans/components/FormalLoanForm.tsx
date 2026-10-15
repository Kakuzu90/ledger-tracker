import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Account, Loan, RateBasis } from '@/db/types'
import { Sheet } from '@/ui/Sheet'
import { Chip } from '@/ui/Chip'
import { formatAmount, parseMoney } from '@/lib/money'
import { useUIStore } from '@/store/ui'
import { fromAnnualRate, toAnnualRate } from '@/lib/loans'
import { deleteLoan, updateLoan, type LoanDraft } from '../db'
import { RateField } from './RateField'

interface FormalLoanFormProps {
  open: boolean
  onClose: () => void
  loan: Loan
  accounts: readonly Account[]
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
  ...(loan.accountId ? { accountId: loan.accountId } : {}),
})

/** Editing an existing formal loan, from the pencil on its detail screen. */
export function FormalLoanForm(props: FormalLoanFormProps) {
  return props.open ? <Form key={props.loan.updatedAt} {...props} /> : null
}

function Form({ onClose, loan, accounts }: FormalLoanFormProps) {
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
  const [problem, setProblem] = useState<string | null>(null)

  const live = accounts.filter((account) => !account.archived || account.id === loan.accountId)
  const update = (patch: Partial<LoanDraft>) => setDraft((current) => ({ ...current, ...patch }))

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
      setProblem(error instanceof Error ? error.message : 'Could not remove that')
    }
  }

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
        <span className="label">First payment</span>
        <input
          className="field mt-1"
          type="date"
          value={draft.startDate}
          onChange={(event) => update({ startDate: event.target.value })}
        />
        <span className="mt-1 block text-meta text-muted">
          Instalment 1 falls a month after this, and the schedule follows from it.
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

      <button
        type="button"
        className="btn-secondary w-full !text-negative"
        onClick={() => void onDelete()}
      >
        Delete loan
      </button>
    </Sheet>
  )
}
