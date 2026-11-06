import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '@/ui/Screen'
import { Money } from '@/ui/Money'
import { Meter } from '@/ui/Meter'
import { EditIcon, PlusIcon, SearchIcon } from '@/ui/Icon'
import { useUIStore } from '@/store/ui'
import { dayHeading } from '@/lib/dates'
import { formatPercent } from '@/lib/money'
import { TxnRow } from '@/features/transactions/components/TxnRow'
import { describeTransaction, subtitle } from '@/features/transactions/describe'
import type { TxnLookups } from '@/features/transactions/describe'
import type { Id } from '@/db/types'
import { useAccountHistory } from './db'
import { cardSummary, cycleLabel, TYPE_LABEL } from './accounts'
import { transferCounterpart, type AccountHistory, type HistoryRow } from './history'
import { AccountTile } from './components/AccountTile'
import { AccountForm } from './components/AccountForm'

/**
 * Days rendered before "Show earlier". An account used for years would
 * otherwise mount every row it has ever held on first paint — the same
 * reason Activity windows its list.
 */
const DAYS_PER_PAGE = 30

/**
 * One account: where it stands, and everything that has moved through it.
 *
 * The row on /accounts used to open the editor, carrying a pencil to admit
 * it was not a link to anywhere. This is the somewhere it should have gone;
 * the pencil moved into the header.
 */
export function AccountScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const openQuickAdd = useUIStore((s) => s.openQuickAdd)
  const today = useMemo(() => new Date(), [])

  const data = useAccountHistory(id)
  const [editing, setEditing] = useState(false)
  const [shown, setShown] = useState(DAYS_PER_PAGE)

  // Deleted from the edit sheet, or a stale link.
  useEffect(() => {
    if (data && data.history === null) navigate('/accounts', { replace: true })
  }, [data, navigate])

  if (!data?.history) {
    return (
      <Screen title="Account" back>
        <div aria-hidden="true" className="h-40 animate-pulse rounded-card bg-surface" />
      </Screen>
    )
  }

  const { history, lookups } = data
  const { account } = history

  return (
    <Screen
      title={account.name}
      back
      actions={
        <button
          type="button"
          className="icon-btn"
          aria-label={`Edit ${account.name}`}
          onClick={() => setEditing(true)}
        >
          <EditIcon size={20} />
        </button>
      }
    >
      <Standing history={history} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => openQuickAdd({ accountId: account.id })}
          className="btn-secondary flex-1"
        >
          <PlusIcon size={18} />
          Add entry
        </button>
        <Link
          to={`/activity?account=${account.id}`}
          className="btn-secondary flex-1 no-underline"
        >
          <SearchIcon size={18} />
          Search
        </Link>
      </div>

      {history.count === 0 ? (
        <section className="card text-center">
          <p className="font-medium">Nothing here yet</p>
          <p className="mt-1 text-meta text-muted">
            Entries on {account.name} appear here, newest first, with the balance each
            day ended on.
          </p>
        </section>
      ) : (
        <>
          <h2 className="label -mb-1 mt-1 px-1">
            History · {history.count} {history.count === 1 ? 'entry' : 'entries'}
          </h2>

          {history.days.slice(0, shown).map((day) => (
            <section key={day.date} className="card py-1">
              <header className="flex items-baseline justify-between gap-3 border-b border-divider py-2">
                <h3 className="truncate text-meta font-semibold">
                  {dayHeading(day.date, today)}
                </h3>
                <p className="flex flex-none items-baseline gap-1.5 text-meta text-muted">
                  <Money value={day.net} tone="auto" signed compact />
                  <span aria-hidden="true">·</span>
                  <span className="sr-only">balance</span>
                  <Money value={day.balance} whole />
                </p>
              </header>

              {day.rows.map((row) => (
                <HistoryEntry
                  key={row.transaction.id}
                  row={row}
                  accountId={account.id}
                  lookups={lookups}
                />
              ))}
            </section>
          ))}

          {history.days.length > shown && (
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => setShown((count) => count + DAYS_PER_PAGE)}
            >
              Show earlier
            </button>
          )}
        </>
      )}

      <AccountForm open={editing} onClose={() => setEditing(false)} account={account} />
    </Screen>
  )
}

function Standing({ history }: { history: AccountHistory }) {
  const { account, balance } = history
  const card = account.type === 'credit' ? cardSummary(account, balance) : undefined

  return (
    <section className="card">
      <div className="flex items-center gap-3">
        <AccountTile type={account.type} color={account.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{account.name}</p>
          <p className="text-meta text-muted">
            {subtitle(
              TYPE_LABEL[account.type],
              account.archived && 'Archived',
              cycleLabel(account),
            )}
          </p>
        </div>
      </div>

      <Money
        value={balance}
        tone={balance < 0 ? 'negative' : 'plain'}
        whole
        className="mb-0.5 mt-3 block text-[32px] font-bold"
      />
      <p className="text-meta text-muted">
        {card ? 'owed on this card' : 'current balance'}
      </p>

      {card && card.limit > 0 && (
        <>
          <Meter value={card.utilization} color="rgb(var(--c-negative))" className="mb-1.5 mt-3.5" />
          <div className="flex justify-between">
            <p className="text-meta text-muted">
              {formatPercent(card.utilization)} of <Money value={card.limit} compact /> limit
            </p>
            <p className="text-meta text-muted">
              <Money
                value={card.available}
                tone={card.available < 0 ? 'negative' : 'plain'}
                whole
                className="font-semibold"
              />{' '}
              {card.available < 0 ? 'over' : 'available'}
            </p>
          </div>
        </>
      )}
    </section>
  )
}

/**
 * One line of the statement. The amount is what this row did to *this*
 * account, so a transfer reads as money leaving or arriving rather than
 * the neutral figure it is from the ledger's point of view.
 */
function HistoryEntry({
  row,
  accountId,
  lookups,
}: {
  row: HistoryRow
  accountId: Id
  lookups: TxnLookups
}) {
  const { transaction } = row
  const described = describeTransaction(transaction, lookups)
  const other = transferCounterpart(transaction, accountId)
  const otherName = other && (lookups.accountById.get(other.id)?.name ?? 'another account')

  // "BPI Savings → GCash" names both ends, which on BPI Savings' own
  // statement says one thing twice. Only the far end is news here.
  const title = other ? `${other.direction === 'out' ? 'To' : 'From'} ${otherName}` : undefined

  return (
    <TxnRow
      row={title ? { ...described, title } : described}
      amount={row.delta}
      subtitle={subtitle(
        other ? 'Transfer' : described.categoryPath,
        transaction.note && other ? transaction.note : undefined,
        ...transaction.tags.map((tag) => `#${tag}`),
        transaction.status === 'pending' && 'Pending · not in the balance',
      )}
    />
  )
}
