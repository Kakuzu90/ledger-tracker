import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { Screen } from '@/ui/Screen'
import { Money } from '@/ui/Money'
import { Sheet } from '@/ui/Sheet'
import { Segmented } from '@/ui/Segmented'
import { DownloadIcon } from '@/ui/Icon'
import { useUIStore } from '@/store/ui'
import { toDateOnly } from '@/lib/dates'
import { buildLookups } from '@/features/transactions/describe'
import { transactionsToCsv } from '@/features/activity/csv'
import { downloadCsv } from '@/lib/csv'
import { useReportsData } from './db'
import {
  buildReports,
  buildYearInReview,
  customRange,
  PERIODS,
  within,
  type PeriodKind,
  type ReportsView,
  type Slice,
} from './reports'

/** The trend is in months for a custom range, which has no cadence of its own. */
const PERIOD_SUFFIX: Record<PeriodKind, string> = {
  week: '/wk',
  month: '/mo',
  year: '/yr',
  custom: '/mo',
}

const PERIOD_NOUN: Record<PeriodKind, string> = {
  week: 'week',
  month: 'month',
  year: 'year',
  custom: 'month',
}

const plural = (count: number, noun: string) => `${noun}${count === 1 ? '' : 's'}`

export function ReportsScreen() {
  const data = useReportsData()
  const showSnack = useUIStore((s) => s.showSnack)
  const today = useMemo(() => new Date(), [])

  const [kind, setKind] = useState<PeriodKind>('month')
  const [from, setFrom] = useState(() => toDateOnly(new Date(today.getFullYear(), today.getMonth() - 2, 1)))
  const [to, setTo] = useState(() => toDateOnly(today))
  const [picking, setPicking] = useState(false)
  const [reviewing, setReviewing] = useState(false)

  const trendKind: PeriodKind = kind === 'custom' ? 'month' : kind

  const view = useMemo(
    () =>
      data
        ? buildReports(data, kind, today, kind === 'custom' ? customRange(from, to) : undefined)
        : undefined,
    [data, kind, today, from, to],
  )

  const onPeriod = (next: PeriodKind) => {
    setKind(next)
    if (next === 'custom') setPicking(true)
  }

  const onExport = () => {
    if (!data || !view) return
    const rows = data.transactions.filter((txn) => within(txn, view.range))
    if (rows.length === 0) {
      showSnack({ message: 'Nothing to export for this period' })
      return
    }

    downloadCsv(
      `ledger-${view.range.start}-to-${view.range.end}.csv`,
      transactionsToCsv(rows, buildLookups(data.categories, data.accounts)),
    )
    showSnack({ message: `Exported ${rows.length} rows` })
  }

  return (
    <Screen
      title="Reports"
      actions={
        <button
          type="button"
          className="icon-btn"
          aria-label="Export CSV"
          // Matches the Activity screen: nothing to export, nothing to press.
          disabled={!view || view.spent === 0}
          onClick={onExport}
        >
          <DownloadIcon size={20} />
        </button>
      }
    >
      <Segmented label="Period" options={PERIODS} value={kind} onChange={onPeriod} />

      {view === undefined ? (
        <div aria-hidden="true" className="h-64 animate-pulse rounded-card bg-surface" />
      ) : (
        <>
          <section className="card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-title font-heading font-semibold">Spending by category</h2>
              {kind === 'custom' ? (
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className="flex min-h-touch items-center text-meta font-medium text-primary"
                >
                  {view.range.label}
                </button>
              ) : (
                <p className="text-meta text-muted">{view.range.label}</p>
              )}
            </div>

            {view.spent === 0 ? (
              <p className="py-8 text-center text-meta text-muted">
                Nothing spent in this period.
              </p>
            ) : (
              <>
                <Donut view={view} />
                <div className="flex items-center justify-end pb-1">
                  <p className="text-meta text-muted">Change vs {view.previous.label}</p>
                </div>
                {view.slices.map((slice) => (
                  <LegendRow key={slice.name} slice={slice} />
                ))}
              </>
            )}
          </section>

          <section className="card">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-title font-heading font-semibold">Income vs spending</h2>
              <div className="flex gap-2.5 text-[12px] text-muted">
                <Key color="rgb(var(--c-primary))" label="In" />
                <Key color="rgb(var(--c-warning))" label="Out" />
              </div>
            </div>
            <Trend view={view} />
            <p className="mt-2.5 text-meta text-muted">
              {view.periodsCounted === 0 ? (
                // A fresh install has nothing to average, and "over 0 months"
                // reads like a bug rather than an empty ledger.
                'Nothing recorded yet.'
              ) : (
                <>
                  Avg saved{' '}
                  <Money
                    value={view.averageSaved}
                    whole
                    className="font-semibold text-ink"
                  />
                  {PERIOD_SUFFIX[trendKind]} over {view.periodsCounted}{' '}
                  {plural(view.periodsCounted, PERIOD_NOUN[trendKind])}
                </>
              )}
            </p>
          </section>

          <section className="flex items-center gap-3.5 rounded-card bg-contrast p-[18px] text-contrast-ink">
            <div className="flex-1">
              <p className="text-label uppercase tracking-[.06em] text-primary-on-contrast">
                Year in review
              </p>
              <p className="mb-0.5 mt-1 font-heading text-screen-sub">
                Your {today.getFullYear()} in money
              </p>
              <p className="text-meta opacity-80">
                Top categories, biggest spends, loans settled
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReviewing(true)}
              className="min-h-touch flex-none rounded-ctl bg-surface px-4 text-sm font-semibold text-ink"
            >
              Open
            </button>
          </section>
        </>
      )}

      <Sheet open={picking} onClose={() => setPicking(false)} title="Custom range">
        <div className="flex gap-3">
          <label className="flex-1">
            <span className="label">From</span>
            <input
              className="field mt-1"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="flex-1">
            <span className="label">To</span>
            <input
              className="field mt-1"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>
        <button type="button" className="btn-primary w-full" onClick={() => setPicking(false)}>
          Show {customRange(from, to).label}
        </button>
      </Sheet>

      {reviewing && data && (
        <YearInReview
          onClose={() => setReviewing(false)}
          data={data}
          year={today.getFullYear()}
          today={today}
        />
      )}
    </Screen>
  )
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        aria-hidden="true"
        className="h-3 w-3 rounded-[3px]"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  )
}

function Donut({ view }: { view: ReportsView }) {
  return (
    <div
      role="img"
      aria-label={`Spending by category. ${view.slices
        .map((slice) => `${slice.name} ${Math.round((slice.amount / view.spent) * 100)}%`)
        .join(', ')}.`}
      className="relative my-3.5 h-[180px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={view.slices}
            dataKey="amount"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={47}
            outerRadius={73}
            startAngle={90}
            endAngle={-270}
            paddingAngle={0}
            stroke="none"
            isAnimationActive={false}
          >
            {view.slices.map((slice) => (
              <Cell key={slice.name} fill={slice.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-meta text-muted">Spent</p>
        <Money value={view.spent} whole className="text-[22px] font-bold" />
      </div>
    </div>
  )
}

function LegendRow({ slice }: { slice: Slice }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-divider py-2 text-sm last:border-b-0">
      <span
        aria-hidden="true"
        className="h-3 w-3 flex-none rounded-[3px]"
        style={{ backgroundColor: slice.color }}
      />
      <span className="min-w-0 flex-1 truncate">{slice.name}</span>
      <Money value={slice.amount} whole className="font-semibold" />
      <span
        className={`num w-[52px] flex-none text-right text-meta ${
          slice.improving ? 'text-primary' : 'text-negative'
        }`}
      >
        {slice.delta}
      </span>
    </div>
  )
}

function Trend({ view }: { view: ReportsView }) {
  // Recharts wants pesos, not centavos, or the axis ticks read in millions.
  const rows = view.trend.map((point, index) => ({
    // Two periods can share a label ("Sep" twice in a weekly axis), so the
    // position is what identifies a bar.
    key: index,
    label: point.label,
    income: point.income / 100,
    expense: point.expense / 100,
    current: point.current,
  }))

  return (
    <>
      <div aria-hidden="true" className="h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barGap={3}>
            <XAxis
              dataKey="label"
              axisLine={{ stroke: 'rgb(var(--c-border))' }}
              tickLine={false}
              tick={{ fill: 'rgb(var(--c-muted))', fontSize: 13 }}
              interval={0}
            />
            <Tooltip
              cursor={{ fill: 'rgb(var(--c-divider))' }}
              content={<TrendTooltip />}
              isAnimationActive={false}
            />
            <Bar dataKey="income" fill="rgb(var(--c-primary))" radius={[4, 4, 0, 0]} maxBarSize={12} isAnimationActive={false} />
            <Bar dataKey="expense" radius={[4, 4, 0, 0]} maxBarSize={12} isAnimationActive={false}>
              {rows.map((row) => (
                <Cell
                  key={row.key}
                  // The period on screen is picked out, as in the mockup.
                  fill={row.current ? 'rgb(var(--c-negative))' : 'rgb(var(--c-warning))'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/*
        The bars carry no numbers — no axis, no labels — so on their own the
        chart says only "taller than". This is the same data as text, which
        is what a screen reader, a keyboard and a careful reader all need.
      */}
      <details className="mt-1 border-t border-divider pt-1.5">
        <summary className="flex min-h-touch cursor-pointer list-none items-center text-meta font-medium text-muted">
          Show these figures
        </summary>
        <table className="mt-1 w-full text-meta">
          <caption className="sr-only">Income and spending by period</caption>
          <thead>
            <tr className="text-muted">
              <th scope="col" className="py-1 text-left font-medium">Period</th>
              <th scope="col" className="py-1 text-right font-medium">In</th>
              <th scope="col" className="py-1 text-right font-medium">Out</th>
            </tr>
          </thead>
          <tbody>
            {view.trend.map((point, index) => (
              <tr key={index} className="border-t border-divider">
                <th scope="row" className="py-1.5 text-left font-medium">
                  {point.label}
                  {point.current && <span className="sr-only"> (current)</span>}
                </th>
                <td className="py-1.5 text-right">
                  <Money value={point.income} tone="positive" whole />
                </td>
                <td className="py-1.5 text-right">
                  <Money value={point.expense} tone="negative" whole />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  )
}

/** Tooltip in the app's own type and colours, not Recharts' default card. */
function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; value?: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  const read = (key: string) => {
    const found = payload.find((entry) => entry.dataKey === key)
    return Math.round((found?.value ?? 0) * 100)
  }

  return (
    <div className="rounded-ctl border border-border bg-surface px-2.5 py-1.5 text-meta shadow-sheet">
      <p className="font-medium">{label}</p>
      <p>
        In <Money value={read('income')} tone="positive" whole className="font-semibold" />
      </p>
      <p>
        Out <Money value={read('expense')} tone="negative" whole className="font-semibold" />
      </p>
    </div>
  )
}

function YearInReview({
  onClose,
  data,
  year,
  today,
}: {
  onClose: () => void
  data: NonNullable<ReturnType<typeof useReportsData>>
  year: number
  today: Date
}) {
  const review = useMemo(() => buildYearInReview(data, year, today), [data, year, today])

  return (
    <Sheet open onClose={onClose} title={`Your ${year} in money`}>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="In" value={review.income} tone="positive" />
        <Stat label="Out" value={review.spent} tone="negative" />
        <Stat label="Saved" value={review.saved} tone="auto" />
      </div>

      {review.spent === 0 ? (
        <p className="py-6 text-center text-meta text-muted">
          Nothing recorded in {year} yet.
        </p>
      ) : (
        <>
          <div>
            <h3 className="label mb-1.5">Where it went</h3>
            <div className="card py-1">
              {review.top.map((slice) => (
                <div
                  key={slice.name}
                  className="flex items-center gap-2.5 border-b border-divider py-2.5 text-sm last:border-b-0"
                >
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 flex-none rounded-[3px]"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="min-w-0 flex-1 truncate">{slice.name}</span>
                  <span className="text-meta text-muted">
                    {Math.round(slice.share * 100)}%
                  </span>
                  <Money value={slice.amount} whole className="font-semibold" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="label mb-1.5">Biggest single spends</h3>
            <div className="card py-1">
              {review.biggest.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center gap-2.5 border-b border-divider py-2.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{row.title}</span>
                    <span className="block text-meta text-muted">
                      {format(parseISO(row.date), 'd MMM')}
                      {row.account && ` · ${row.account}`}
                    </span>
                  </span>
                  <Money value={row.amount} whole className="flex-none font-semibold" />
                </div>
              ))}
            </div>
          </div>

          <p className="text-meta text-muted">
            {review.leanestMonth && `${review.leanestMonth} was the leanest month. `}
            {review.loansSettled > 0
              ? `${review.loansSettled} ${review.loansSettled === 1 ? 'loan' : 'loans'} settled.`
              : 'No loans settled this year.'}
          </p>
        </>
      )}
    </Sheet>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'positive' | 'negative' | 'auto'
}) {
  return (
    <div className="rounded-ctl bg-surface p-3 text-center">
      <p className="text-meta text-muted">{label}</p>
      <p className="num font-semibold">
        <Money value={value} tone={tone} whole />
      </p>
    </div>
  )
}
