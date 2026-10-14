import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Screen } from '@/ui/Screen'
import { Money } from '@/ui/Money'
import { Segmented } from '@/ui/Segmented'
import { CategoryTile } from '@/ui/CategoryTile'
import { PlusIcon } from '@/ui/Icon'
import { useUIStore } from '@/store/ui'
import { formatAmount, formatMoney, parseMoney } from '@/lib/money'
import { subtitle } from '@/features/transactions/describe'
import { createContact } from '@/features/loans/db'
import { Avatar } from '@/features/loans/components/Avatar'
import type { Id } from '@/db/types'
import { createSplit, removeSplit, useSplitData } from './db'
import { computeSplit, listNames, METHODS, YOU, type Participant, type SplitMethod } from './split'

export function SplitScreen() {
  const { txnId } = useParams<{ txnId: string }>()
  const navigate = useNavigate()
  const showSnack = useUIStore((s) => s.showSnack)
  const data = useSplitData(txnId)

  const [method, setMethod] = useState<SplitMethod>('equally')
  const [picked, setPicked] = useState<ReadonlySet<Id>>(new Set())
  const [amounts, setAmounts] = useState<Readonly<Record<string, string>>>({})
  const [shares, setShares] = useState<Readonly<Record<string, string>>>({})
  const [newName, setNewName] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const total = data?.transaction?.amount ?? 0

  const participants: Participant[] = useMemo(() => {
    const people = data?.contacts ?? []
    return [
      { key: YOU, name: 'You', included: true },
      ...people.map((contact) => ({ key: contact.id, name: contact.name, included: picked.has(contact.id) })),
    ].map((person) => ({
      ...person,
      ...(method === 'amount' ? { amount: parseMoney(amounts[person.key] ?? '') ?? 0 } : {}),
      ...(method === 'shares' ? { shares: Number(shares[person.key] ?? '1') || 0 } : {}),
    }))
  }, [data, picked, method, amounts, shares])

  const result = useMemo(
    () => computeSplit(total, participants, method),
    [total, participants, method],
  )

  // The transaction went away (deleted from its detail screen); step back.
  useEffect(() => {
    if (data && data.transaction === null) navigate('/activity', { replace: true })
  }, [data, navigate])

  if (!data?.transaction) {
    return (
      <Screen title="Split expense" back>
        <div aria-hidden="true" className="h-36 animate-pulse rounded-card bg-surface" />
      </Screen>
    )
  }

  const { transaction, existing, paidLoanIds } = data
  const alreadySplit = existing.length > 0

  const toggle = (id: Id) =>
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const onAddContact = async () => {
    const name = newName?.trim()
    if (!name) return
    const id = await createContact(name)
    setPicked((current) => new Set(current).add(id))
    setNewName(null)
  }

  const onSplit = async () => {
    setSaving(true)
    setProblem(null)
    try {
      const created = await createSplit(
        transaction.id,
        result.debtors.map((share) => ({ contactId: share.key, amount: share.amount })),
      )
      showSnack({
        message: `${created.length} ${created.length === 1 ? 'loan' : 'loans'} created`,
      })
      navigate(`/txn/${transaction.id}`, { replace: true })
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not split that')
      setSaving(false)
    }
  }

  const onRemove = async () => {
    try {
      await removeSplit(transaction.id)
      showSnack({ message: 'Split removed' })
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not remove that')
    }
  }

  if (transaction.type !== 'expense') {
    return (
      <Screen title="Split expense" back>
        <section className="card text-center">
          <p className="font-medium">Only an expense can be split</p>
          <p className="mt-1 text-meta text-muted">
            Splitting turns your share of a bill into loans. A{' '}
            {transaction.type === 'income' ? 'payment you received' : 'transfer'} has no
            share to hand out.
          </p>
          <Link to={`/txn/${transaction.id}`} className="btn-secondary mt-4 w-full">
            Back to the transaction
          </Link>
        </section>
      </Screen>
    )
  }

  return (
    <Screen title="Split expense" back>
      <section className="card flex items-center gap-3">
        <CategoryTile
          color="#B4501A"
          name={transaction.note || data.category?.name || 'Expense'}
          className="!h-11 !w-11"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {transaction.note || data.categoryPath || 'Expense'}
          </p>
          <p className="truncate text-meta text-muted">
            {subtitle(
              data.categoryPath,
              data.account?.name,
              format(parseISO(transaction.date), 'MMM d'),
            )}
          </p>
        </div>
        <Money value={total} compact className="flex-none text-xl font-bold" />
      </section>

      {alreadySplit ? (
        <>
          <section className="rounded-[16px] border border-primary/30 bg-primary-soft p-4">
            <p className="font-semibold text-primary">
              Already split into {existing.length} {existing.length === 1 ? 'loan' : 'loans'}
            </p>
            <p className="mt-1 text-meta text-muted">
              Each one lives under that person, and settles when they pay you back.
            </p>
          </section>

          <div className="card py-1">
            {existing.map((loan) => {
              const name =
                data.contacts.find((contact) => contact.id === loan.contactId)?.name ??
                'Someone'
              return (
                <Link
                  key={loan.id}
                  to={`/loans/person/${loan.contactId}`}
                  className="list-row no-underline"
                >
                  <Avatar name={name} tone="positive" />
                  <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                  <Money value={loan.principal} compact className="font-semibold" />
                </Link>
              )
            })}
          </div>

          {problem && (
            <p role="alert" className="text-center text-meta text-negative">
              {problem}
            </p>
          )}

          <button
            type="button"
            className="btn-secondary w-full !text-negative disabled:opacity-50"
            disabled={paidLoanIds.length > 0}
            onClick={() => void onRemove()}
          >
            {paidLoanIds.length > 0 ? 'Partly repaid — cannot undo' : 'Remove this split'}
          </button>
        </>
      ) : (
        <>
          <Segmented
            label="Split method"
            options={METHODS}
            value={method}
            onChange={setMethod}
          />

          <div className="card py-0">
            {result.shares.map((share) => {
              const isYou = share.key === YOU
              return (
                <div key={share.key} className="list-row min-h-[60px]">
                  <input
                    type="checkbox"
                    checked={share.included}
                    disabled={isYou}
                    onChange={() => toggle(share.key)}
                    aria-label={`Include ${share.name}`}
                    className="h-[22px] w-[22px] flex-none accent-primary disabled:opacity-40"
                  />
                  {isYou ? (
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-contrast font-heading text-[13px] font-semibold text-contrast-ink"
                    >
                      You
                    </span>
                  ) : (
                    <Avatar
                      name={share.name}
                      tone={share.included ? 'positive' : 'neutral'}
                      className="!h-9 !w-9 !text-[13px]"
                    />
                  )}
                  <span
                    className={`min-w-0 flex-1 truncate font-medium ${
                      share.included ? '' : 'text-muted'
                    }`}
                  >
                    {share.name}
                  </span>

                  {!share.included ? (
                    <span className="num text-muted">—</span>
                  ) : method === 'amount' ? (
                    <input
                      className="field !min-h-[40px] w-[108px] flex-none text-right font-heading font-semibold"
                      type="text"
                      inputMode="decimal"
                      value={amounts[share.key] ?? ''}
                      onChange={(event) =>
                        setAmounts((current) => ({
                          ...current,
                          [share.key]: event.target.value,
                        }))
                      }
                      placeholder="0.00"
                      aria-label={`${share.name}'s amount`}
                    />
                  ) : method === 'shares' ? (
                    <span className="flex flex-none items-center gap-2">
                      <input
                        className="field !min-h-[40px] w-[64px] text-right font-heading font-semibold"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={shares[share.key] ?? '1'}
                        onChange={(event) =>
                          setShares((current) => ({
                            ...current,
                            [share.key]: event.target.value,
                          }))
                        }
                        aria-label={`${share.name}'s shares`}
                      />
                      <Money value={share.amount} compact className="w-[76px] text-right font-semibold" />
                    </span>
                  ) : (
                    <Money value={share.amount} compact className="font-semibold" />
                  )}
                </div>
              )
            })}
          </div>

          {newName === null ? (
            <button
              type="button"
              onClick={() => setNewName('')}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-btn border border-dashed border-border-strong font-medium"
            >
              <PlusIcon size={18} />
              Add person
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                className="field"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Their name"
                aria-label="New contact name"
                autoFocus
              />
              <button type="button" className="btn-secondary" onClick={() => void onAddContact()}>
                Add
              </button>
            </div>
          )}

          <section
            className={`rounded-[16px] border p-4 ${
              result.valid
                ? 'border-primary/30 bg-primary-soft'
                : 'border-border bg-surface'
            }`}
          >
            <p className={`font-semibold ${result.valid ? 'text-primary' : 'text-ink'}`}>
              {result.valid
                ? `This will create ${result.debtors.length} ${
                    result.debtors.length === 1 ? 'loan' : 'loans'
                  }`
                : (result.problem ?? 'Nothing to split yet')}
            </p>
            <p className="mt-1 text-meta text-muted">
              {result.valid
                ? `${listNames(result.debtors.map((share) => share.name))} ${
                    result.debtors.length === 1 ? 'owes' : 'owe'
                  } you ${formatMoney(result.owed, { compact: true })}. Your share of ${formatMoney(
                    result.shares.find((share) => share.key === YOU)?.amount ?? 0,
                    { compact: true },
                  )} stays as your ${data.categoryPath ?? 'own'} expense.`
                : method === 'amount' && result.remainder !== 0
                  ? `${formatAmount(Math.abs(result.remainder))} ${
                      result.remainder > 0 ? 'still to assign' : 'over the bill'
                    }.`
                  : 'Tick the people who owe you a share of this bill.'}
            </p>
          </section>

          {problem && (
            <p role="alert" className="text-center text-meta text-negative">
              {problem}
            </p>
          )}

          <button
            type="button"
            className="btn-primary min-h-[52px] w-full disabled:opacity-50"
            disabled={!result.valid || saving}
            onClick={() => void onSplit()}
          >
            Split &amp; create loans
          </button>
        </>
      )}
    </Screen>
  )
}
