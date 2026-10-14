import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { db } from '@/db/db'
import { Screen } from '@/ui/Screen'
import { Money } from '@/ui/Money'
import { CategoryTile } from '@/ui/CategoryTile'
import { CopyIcon, EditIcon, LoansIcon, RepeatIcon, SplitIcon, TrashIcon } from '@/ui/Icon'
import { useUIStore } from '@/store/ui'
import { buildLookups, describeTransaction } from './describe'
import {
  deleteTransaction,
  duplicateTransaction,
  makeRecurring,
  restoreTransaction,
} from './db'
import { ReceiptCard } from './components/ReceiptCard'

export function TxnDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const showSnack = useUIStore((s) => s.showSnack)
  const [problem, setProblem] = useState<string | null>(null)

  const data = useLiveQuery(async () => {
    if (!id) return null
    const transaction = await db.transactions.get(id)
    if (!transaction) return null

    const [categories, accounts, receipt, rule] = await Promise.all([
      db.categories.toArray(),
      db.accounts.toArray(),
      transaction.receiptId ? db.receipts.get(transaction.receiptId) : undefined,
      transaction.recurringId ? db.recurring.get(transaction.recurringId) : undefined,
    ])

    return { transaction, lookups: buildLookups(categories, accounts), receipt, rule }
  }, [id])

  const row = useMemo(
    () => (data ? describeTransaction(data.transaction, data.lookups) : undefined),
    [data],
  )

  // A deleted transaction leaves this screen behind; step back to the list.
  useEffect(() => {
    if (data === null) navigate('/activity', { replace: true })
  }, [data, navigate])

  if (!data || !row) {
    return (
      <Screen title="Transaction" back>
        <div aria-hidden="true" className="h-40 animate-pulse rounded-card bg-surface" />
      </Screen>
    )
  }

  const { transaction, receipt, rule } = data

  const onDuplicate = async () => {
    const copy = await duplicateTransaction(transaction.id)
    showSnack({ message: 'Copied to today' })
    navigate(`/txn/${copy}`, { replace: true })
  }

  const onMakeRecurring = async () => {
    await makeRecurring(transaction.id)
    showSnack({ message: 'Repeats monthly from now on' })
  }

  const onDelete = async () => {
    try {
      const deleted = await deleteTransaction(transaction.id)
      navigate('/activity', { replace: true })
      showSnack({
        message: 'Transaction deleted',
        actionLabel: 'Undo',
        onAction: () => restoreTransaction(deleted),
      })
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not delete that')
    }
  }

  return (
    <Screen
      title="Transaction"
      back
      actions={
        <Link to={`/txn/${transaction.id}/edit`} className="icon-btn" aria-label="Edit">
          <EditIcon size={20} />
        </Link>
      }
    >
      <div className="pb-1 pt-2 text-center">
        {row.isTransfer ? (
          <span
            aria-hidden="true"
            className="mx-auto mb-2.5 flex h-14 w-14 items-center justify-center rounded-[16px] bg-divider text-muted"
          >
            <LoansIcon size={22} />
          </span>
        ) : (
          <CategoryTile
            color={row.color}
            name={row.tileName}
            className="mx-auto mb-2.5 !h-14 !w-14 !rounded-[16px] !text-[18px]"
          />
        )}
        <Money
          value={row.amount}
          tone={row.tone}
          signed={!row.isTransfer}
          className="block text-4xl font-bold"
        />
        <p className="mt-0.5 font-medium">{row.title}</p>
      </div>

      <dl className="card m-0">
        <Field label="Category" value={row.categoryPath ?? '—'} />
        <Field
          label={row.isTransfer ? 'From' : 'Account'}
          value={row.accountName ?? '—'}
        />
        {row.toAccountName && <Field label="To" value={row.toAccountName} />}
        <Field label="Date" value={format(parseISO(transaction.date), 'MMM d, yyyy')} />
        <div className="flex min-h-[50px] items-center justify-between gap-3 border-b border-divider last:border-b-0">
          <dt className="text-sm text-muted">Tags</dt>
          <dd className="m-0 flex flex-wrap justify-end gap-1.5">
            {transaction.tags.length === 0 ? (
              <span className="font-medium">—</span>
            ) : (
              transaction.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex min-h-[28px] items-center rounded-full bg-divider px-2.5 text-meta font-medium text-muted"
                >
                  #{tag}
                </span>
              ))
            )}
          </dd>
        </div>
        <Field label="Repeats" value={rule ? `Every ${rule.interval} ${rule.freq}` : 'Never'} />
        {transaction.note && (
          <div className="flex items-start justify-between gap-3 border-b border-divider py-3.5 last:border-b-0">
            <dt className="text-sm text-muted">Note</dt>
            <dd className="m-0 max-w-[220px] text-right">{transaction.note}</dd>
          </div>
        )}
      </dl>

      <ReceiptCard transactionId={transaction.id} receipt={receipt} />

      <div className="grid grid-cols-3 gap-2">
        <button type="button" className="action-tile" onClick={() => void onDuplicate()}>
          <CopyIcon />
          Duplicate
        </button>
        <Link to={`/split/${transaction.id}`} className="action-tile">
          <SplitIcon />
          Split
        </Link>
        <button
          type="button"
          className="action-tile"
          onClick={() => void onMakeRecurring()}
          disabled={rule !== undefined}
        >
          <RepeatIcon size={20} />
          {rule ? 'Recurring' : 'Make recurring'}
        </button>
      </div>

      {problem && (
        <p role="alert" className="text-center text-meta text-negative">
          {problem}
        </p>
      )}

      <button
        type="button"
        onClick={() => void onDelete()}
        className="flex min-h-[50px] items-center justify-center gap-2 rounded-btn border border-negative/30 bg-negative-soft font-semibold text-negative"
      >
        <TrashIcon />
        Delete transaction
      </button>
    </Screen>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[50px] items-center justify-between gap-3 border-b border-divider last:border-b-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="m-0 text-right font-medium">{value}</dd>
    </div>
  )
}
