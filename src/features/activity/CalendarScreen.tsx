import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Link } from 'react-router-dom'
import { ChevronLeftIcon, ChevronRightIcon } from '@/ui/Icon'
import { Money } from '@/ui/Money'
import { formatMoneyShort } from '@/lib/money'
import { dayHeading, monthKey } from '@/lib/dates'
import { useActivityData } from './db'
import { buildMonthGrid, defaultSelectedDay, shiftMonth, type DayCell } from './calendar'
import { TxnRow } from '@/features/transactions/components/TxnRow'
import { activitySubtitle, describeTransaction } from '@/features/transactions/describe'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Four shades of the spend colour, mixed so they work in both themes. */
const HEAT = [
  'transparent',
  'color-mix(in srgb, rgb(var(--c-negative)) 12%, rgb(var(--c-surface)))',
  'color-mix(in srgb, rgb(var(--c-negative)) 32%, rgb(var(--c-surface)))',
  'color-mix(in srgb, rgb(var(--c-negative)) 60%, rgb(var(--c-surface)))',
  'rgb(var(--c-negative))',
] as const

function Cell({
  cell,
  selected,
  onSelect,
}: {
  cell: DayCell
  selected: boolean
  onSelect: () => void
}) {
  const label = `${format(parseISO(cell.date), 'EEEE d MMMM')}${
    cell.spent > 0 ? `, ${formatMoneyShort(cell.spent)} spent` : ', nothing spent'
  }${cell.hasBill ? ', bill due' : ''}`

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex h-14 flex-col items-center justify-between rounded-[10px] px-0.5 py-1 ${
        cell.level === 4 ? 'text-negative-ink' : 'text-ink'
      } ${selected ? 'ring-2 ring-ink' : ''} ${cell.isFuture ? 'opacity-50' : ''}`}
      style={{ background: HEAT[cell.level] }}
    >
      <span className={`text-[13px] ${cell.isToday ? 'font-bold' : 'font-normal'}`}>
        {cell.day}
      </span>
      <span className="num text-[10px] font-semibold">
        {cell.spent > 0 ? formatMoneyShort(cell.spent) : ''}
      </span>
      <span
        aria-hidden="true"
        className="h-[5px] w-[5px] rounded-full"
        style={{
          background: '#4B3A8C',
          opacity: cell.hasBill ? 1 : 0,
        }}
      />
    </button>
  )
}

export function CalendarScreen() {
  const today = useMemo(() => new Date(), [])
  const data = useActivityData(today)
  const recurring = useLiveQuery(() => db.recurring.toArray(), [])

  const [month, setMonth] = useState(() => monthKey(today))
  const [picked, setPicked] = useState<string | null>(null)

  const grid = useMemo(
    () => buildMonthGrid(month, data?.transactions ?? [], recurring ?? [], today),
    [month, data, recurring, today],
  )

  // Until the user taps a day, follow the month being viewed.
  const selected = picked ?? defaultSelectedDay(grid, today)

  const dayRows = useMemo(() => {
    if (!data || !selected) return []
    return data.transactions
      .filter((txn) => txn.date === selected && txn.status === 'posted')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [data, selected])

  const goTo = (by: number) => {
    setMonth((current) => shiftMonth(current, by))
    setPicked(null)
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-screen pb-28">
      <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
        <button
          type="button"
          className="icon-btn"
          aria-label="Previous month"
          onClick={() => goTo(-1)}
        >
          <ChevronLeftIcon size={20} />
        </button>
        <div className="text-center">
          <h1 className="text-xl">{format(parseISO(`${month}-01`), 'MMMM yyyy')}</h1>
          <p className="text-meta">
            <Money value={-grid.totalSpent} tone="negative" compact /> spent
          </p>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Next month"
          onClick={() => goTo(1)}
        >
          <ChevronRightIcon size={20} />
        </button>
      </header>

      <div className="px-4">
        <div
          role="group"
          aria-label="View"
          className="mx-1 mb-3 flex gap-1 rounded-ctl bg-divider p-1"
        >
          <Link
            to="/activity"
            className="flex min-h-[40px] flex-1 items-center justify-center rounded-[9px] text-sm font-medium text-muted no-underline"
          >
            List
          </Link>
          <span
            aria-current="page"
            className="flex min-h-[40px] flex-1 items-center justify-center rounded-[9px] bg-surface text-sm font-medium text-ink shadow-sm"
          >
            Calendar
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((day) => (
            <span key={day} className="text-center text-label text-muted">
              {day}
            </span>
          ))}
          {Array.from({ length: grid.leading }, (_, i) => (
            <span key={`blank-${i}`} aria-hidden="true" />
          ))}
          {grid.cells.map((cell) => (
            <Cell
              key={cell.date}
              cell={cell}
              selected={cell.date === selected}
              onSelect={() => setPicked(cell.date)}
            />
          ))}
        </div>

        <div className="mx-1 mt-2.5 flex items-center gap-1.5 text-xs text-muted">
          <span>Less</span>
          {[1, 2, 3, 4].map((level) => (
            <span
              key={level}
              aria-hidden="true"
              className="h-3 w-4 rounded-[3px]"
              style={{ background: HEAT[level] }}
            />
          ))}
          <span>More</span>
          <span className="ml-auto flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: '#4B3A8C' }}
            />
            Bill due
          </span>
        </div>

        {selected && (
          <>
            <div className="mx-1 mb-1.5 mt-4 flex items-baseline justify-between">
              <h2 className="text-base">{dayHeading(selected, today)}</h2>
              <p className="text-meta text-muted">
                {dayRows.length === 0 ? (
                  'Nothing'
                ) : (
                  <>
                    <Money
                      value={-(grid.cells.find((c) => c.date === selected)?.spent ?? 0)}
                      tone="negative"
                      compact
                    />
                    {' · '}
                    <Money
                      value={grid.cells.find((c) => c.date === selected)?.income ?? 0}
                      tone="positive"
                      signed
                      compact
                    />
                  </>
                )}
              </p>
            </div>

            {dayRows.length > 0 && data && (
              <div className="card py-1">
                {dayRows.map((txn) => {
                  const row = describeTransaction(txn, data.lookups)
                  return <TxnRow key={txn.id} row={row} subtitle={activitySubtitle(row)} />
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
