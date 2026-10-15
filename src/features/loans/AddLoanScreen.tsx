import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Screen } from '@/ui/Screen'
import { Chip } from '@/ui/Chip'
import { Segmented } from '@/ui/Segmented'
import { Toggle } from '@/ui/Toggle'
import { Money } from '@/ui/Money'
import { PlusIcon } from '@/ui/Icon'
import { useUIStore } from '@/store/ui'
import { parseMoney } from '@/lib/money'
import { toDateOnly } from '@/lib/dates'
import { monthlyPayment } from '@/lib/amortization'
import { toAnnualRate } from '@/lib/loans'
import type { Id, LoanDirection, LoanKind, RateBasis } from '@/db/types'
import { createContact, createLoan, useLoansData } from './db'
import { Avatar } from './components/Avatar'
import { RateField } from './components/RateField'

const KINDS: ReadonlyArray<{ value: LoanKind; label: string }> = [
  { value: 'personal', label: 'Personal' },
  { value: 'formal', label: 'Bank / formal' },
]

/** `"7"` → 7, anything else → undefined, so a blank field stays unset. */
const number = (raw: string): number | undefined => {
  if (raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

export function AddLoanScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const data = useLoansData()
  const showSnack = useUIStore((s) => s.showSnack)

  const [kind, setKind] = useState<LoanKind>('personal')
  const [direction, setDirection] = useState<LoanDirection>('lent')
  const [amountInput, setAmountInput] = useState('')
  const [contactId, setContactId] = useState<Id | undefined>(
    params.get('contact') ?? undefined,
  )
  const [newName, setNewName] = useState<string | null>(null)
  const [lender, setLender] = useState('')
  const [ratePct, setRatePct] = useState('')
  // Per month is how loans are quoted here, so it is where the form starts.
  const [rateBasis, setRateBasis] = useState<RateBasis>('month')
  const [termMonths, setTermMonths] = useState('')
  const [startDate, setStartDate] = useState(toDateOnly(new Date()))
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [accountId, setAccountId] = useState<Id | undefined>()
  const [moveMoney, setMoveMoney] = useState(true)
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const accounts = data?.accounts ?? []
  const account = accountId ?? accounts[0]?.id
  const principal = parseMoney(amountInput) ?? 0
  const isPersonal = kind === 'personal'

  const term = number(termMonths) ?? 0
  const rate = toAnnualRate(number(ratePct) ?? 0, rateBasis)
  const instalment = !isPersonal && term > 0 ? monthlyPayment(principal, rate, term) : 0

  const onAddContact = async () => {
    const name = newName?.trim()
    if (!name) return
    const id = await createContact(name)
    setContactId(id)
    setNewName(null)
  }

  const onSave = async () => {
    setSaving(true)
    setProblem(null)
    try {
      await createLoan({
        kind,
        direction: isPersonal ? direction : 'borrowed',
        ...(isPersonal && contactId ? { contactId } : {}),
        ...(isPersonal ? {} : { lender }),
        principal,
        ...(isPersonal ? {} : { ratePct: rate, rateBasis, termMonths: term }),
        startDate,
        ...(isPersonal && dueDate ? { dueDate } : {}),
        note,
        ...(account ? { accountId: account } : {}),
        moveMoney: isPersonal && moveMoney,
      })

      showSnack({ message: 'Loan added' })
      navigate(isPersonal && contactId ? `/loans/person/${contactId}` : '/loans', {
        replace: true,
      })
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not save that')
      setSaving(false)
    }
  }

  return (
    <Screen title="New loan" back>
      <Segmented label="Loan kind" options={KINDS} value={kind} onChange={setKind} />

      {isPersonal && (
        <div role="group" aria-label="Direction" className="flex gap-2">
          {(
            [
              ['lent', 'I lent money'],
              ['borrowed', 'I borrowed'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={direction === value}
              onClick={() => setDirection(value)}
              className={`min-h-[48px] flex-1 rounded-ctl border text-sm font-semibold ${
                direction === value
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-border-strong bg-surface text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <label className="block">
        <span className="label">Amount</span>
        <input
          className="field mt-1 min-h-[60px] font-heading text-[28px] font-bold"
          type="text"
          inputMode="decimal"
          value={amountInput}
          onChange={(event) => setAmountInput(event.target.value)}
          placeholder="0.00"
          autoFocus
        />
      </label>

      {isPersonal ? (
        <div>
          <span className="label">Person</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(data?.contacts ?? []).map((contact) => (
              <Chip
                key={contact.id}
                active={contact.id === contactId}
                onClick={() => setContactId(contact.id)}
              >
                <Avatar name={contact.name} className="!-ml-2 !h-7 !w-7 !text-label" />
                {contact.name}
              </Chip>
            ))}
            {newName === null ? (
              <Chip onClick={() => setNewName('')}>
                <PlusIcon size={16} />
                New contact
              </Chip>
            ) : null}
          </div>

          {newName !== null && (
            <div className="mt-2 flex gap-2">
              <input
                className="field"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Their name"
                aria-label="New contact name"
                autoFocus
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void onAddContact()}
              >
                Add
              </button>
            </div>
          )}
        </div>
      ) : (
        <label className="block">
          <span className="label">Lender</span>
          <input
            className="field mt-1"
            value={lender}
            onChange={(event) => setLender(event.target.value)}
            placeholder="BDO"
          />
        </label>
      )}

      {!isPersonal && (
        <div className="flex gap-3">
          <div className="flex-1">
            <RateField
              rate={ratePct}
              basis={rateBasis}
              onRate={setRatePct}
              onBasis={setRateBasis}
            />
          </div>
          <label className="flex-1">
            <span className="label">Term, months</span>
            <input
              className="field mt-1"
              type="number"
              inputMode="numeric"
              min={1}
              value={termMonths}
              onChange={(event) => setTermMonths(event.target.value)}
              placeholder="60"
            />
          </label>
        </div>
      )}

      <div className="flex gap-3">
        <label className="flex-1">
          <span className="label">{isPersonal ? 'Date' : 'First payment'}</span>
          <input
            className="field mt-1"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        {isPersonal && (
          <label className="flex-1">
            <span className="label">Due date</span>
            <input
              className="field mt-1"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
        )}
      </div>

      <label className="block">
        <span className="label">{isPersonal ? "What's it for?" : 'Name it'}</span>
        <input
          className="field mt-1"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={isPersonal ? 'Phone repair' : 'Car loan'}
        />
      </label>

      <div>
        <span className="label">{isPersonal ? 'Account' : 'Pay it from'}</span>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {accounts.map((row) => (
            <Chip
              key={row.id}
              active={row.id === account}
              dot={row.color}
              onClick={() => setAccountId(row.id)}
            >
              {row.name}
            </Chip>
          ))}
        </div>
      </div>

      {isPersonal ? (
        <div className="rounded-[16px] border border-border bg-surface px-4">
          <Toggle
            checked={moveMoney}
            onChange={setMoveMoney}
            label={direction === 'lent' ? 'Take from account' : 'Add to account'}
            hint={
              moveMoney
                ? `${accounts.find((row) => row.id === account)?.name ?? 'The account'} · balance updates`
                : 'The money changed hands outside the app'
            }
          />
        </div>
      ) : (
        instalment > 0 && (
          <p className="rounded-[16px] border border-primary/30 bg-primary-soft p-3.5 text-meta text-muted">
            About <Money value={instalment} whole className="font-semibold text-ink" /> a
            month over {term} months. Log each payment from the loan and it posts to the
            account above.
          </p>
        )
      )}

      {problem && (
        <p role="alert" className="text-center text-meta text-negative">
          {problem}
        </p>
      )}

      <button
        type="button"
        className="btn-primary min-h-[52px] w-full disabled:opacity-50"
        disabled={saving || principal <= 0}
        onClick={() => void onSave()}
      >
        Save loan
      </button>
    </Screen>
  )
}
