import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '@/ui/Screen'
import { CalendarIcon, DownloadIcon, SearchIcon } from '@/ui/Icon'
import { Money } from '@/ui/Money'
import { useUIStore } from '@/store/ui'
import { monthKey, dayHeading, toDateOnly } from '@/lib/dates'
import { downloadCsv } from '@/lib/csv'
import { TxnRow } from '@/features/transactions/components/TxnRow'
import { activitySubtitle, describeTransaction } from '@/features/transactions/describe'
import { orderCategories } from '@/features/transactions/categories'
import { confirmPending, skipPending } from '@/features/transactions/db'
import { useActivityData } from './db'
import { FilterBar } from './components/FilterBar'
import { PendingRecurring } from './components/PendingRecurring'
import {
  activeFilterCount,
  applyFilters,
  availableMonths,
  emptyFilters,
  groupByDay,
  summarize,
  tagCounts,
  type ActivityFilters,
} from './filters'
import { transactionsToCsv } from './csv'

export function ActivityScreen() {
  const today = useMemo(() => new Date(), [])
  const data = useActivityData(today)
  const showSnack = useUIStore((s) => s.showSnack)

  const [filters, setFilters] = useState<ActivityFilters>(() => emptyFilters(monthKey(today)))

  const view = useMemo(() => {
    if (!data) return undefined

    const matched = applyFilters(data.transactions, filters, data.lookups)
    return {
      groups: groupByDay(matched),
      summary: summarize(matched),
      months: availableMonths(data.transactions),
      tags: tagCounts(data.transactions),
      count: matched.length,
      matched,
    }
  }, [data, filters])

  const onExport = () => {
    if (!data || !view) return
    const csv = transactionsToCsv(view.matched, data.lookups)
    downloadCsv(`ledger-${toDateOnly(today)}.csv`, csv)
  }

  const onConfirm = async (id: string) => {
    await confirmPending(id)
    showSnack({ message: 'Added to your ledger' })
  }

  const onSkip = async (id: string) => {
    await skipPending(id)
    showSnack({ message: 'Skipped this one' })
  }

  return (
    <Screen
      title="Activity"
      actions={
        <>
          <Link to="/activity/calendar" className="icon-btn" aria-label="Calendar view">
            <CalendarIcon size={20} />
          </Link>
          <button
            type="button"
            className="icon-btn"
            aria-label="Export CSV"
            onClick={onExport}
            disabled={!view || view.count === 0}
          >
            <DownloadIcon size={20} />
          </button>
        </>
      }
    >
      <div className="relative">
        <SearchIcon
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-[15px] text-muted"
        />
        <label htmlFor="act-search" className="sr-only">
          Search transactions
        </label>
        <input
          id="act-search"
          type="search"
          className="field pl-[42px]"
          placeholder="Search notes, merchants, #tags"
          value={filters.query}
          onChange={(event) => setFilters({ ...filters, query: event.target.value })}
        />
      </div>

      {data && view && (
        <FilterBar
          filters={filters}
          onChange={setFilters}
          months={view.months}
          accounts={data.accounts.filter((a) => !a.archived)}
          categories={orderCategories(data.categories.filter((c) => !c.archived))}
          tags={view.tags}
          lookups={data.lookups}
        />
      )}

      {view && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-meta text-muted">In</p>
            <Money value={view.summary.income} tone="positive" signed compact className="font-semibold" />
          </div>
          <div>
            <p className="text-meta text-muted">Out</p>
            <Money value={-view.summary.expense} tone="negative" compact className="font-semibold" />
          </div>
          <div>
            <p className="text-meta text-muted">Net</p>
            <Money value={view.summary.net} signed compact className="font-semibold" />
          </div>
        </div>
      )}

      {data?.pending.map(({ transaction, rule }) => (
        <PendingRecurring
          key={transaction.id}
          transaction={transaction}
          rule={rule}
          today={today}
          onConfirm={() => void onConfirm(transaction.id)}
          onSkip={() => void onSkip(transaction.id)}
        />
      ))}

      {data && view && view.groups.length === 0 && (
        <section className="card text-center">
          <p className="font-medium">Nothing here</p>
          <p className="mt-1 text-meta text-muted">
            {filters.query !== '' || activeFilterCount(filters) > 0
              ? 'No transactions match these filters.'
              : 'Transactions you add will show up here.'}
          </p>
          {(filters.query !== '' || activeFilterCount(filters) > 0) && (
            <button
              type="button"
              className="btn-secondary mt-4 w-full"
              onClick={() => setFilters(emptyFilters(filters.month))}
            >
              Clear filters
            </button>
          )}
        </section>
      )}

      {data &&
        view?.groups.map((group) => (
          <section key={group.date}>
            <div className="mb-1.5 mt-1 flex items-baseline justify-between px-1">
              <h2 className="label">{dayHeading(group.date, today)}</h2>
              <Money
                value={group.net}
                tone="auto"
                signed
                compact
                className="text-sm font-medium"
              />
            </div>
            <div className="card py-1">
              {group.transactions.map((txn) => {
                const row = describeTransaction(txn, data.lookups)
                return <TxnRow key={txn.id} row={row} subtitle={activitySubtitle(row)} />
              })}
            </div>
          </section>
        ))}
    </Screen>
  )
}
