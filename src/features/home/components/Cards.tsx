import { Link } from 'react-router-dom'
import type { BillSummary, BudgetSummary, LoansSummary, RecentRow } from '../dashboard'
import type { Centavos } from '@/db/types'
import type { NetWorth } from '@/lib/balances'
import { Money } from '@/ui/Money'
import { Meter } from '@/ui/Meter'
import { CategoryTile } from '@/ui/CategoryTile'
import { AlertIcon, ChevronRightIcon } from '@/ui/Icon'
import { formatMoney, formatPercent } from '@/lib/money'
import { relativeDay } from '@/lib/dates'

/** Card header with a link on the right. */
function SectionHeader({ title, to, action }: { title: string; to: string; action: string }) {
  return (
    <div className="mb-1.5 flex items-center justify-between">
      <h2 className="text-title">{title}</h2>
      <Link
        to={to}
        className="flex min-h-touch items-center text-sm font-medium text-primary no-underline"
      >
        {action}
      </Link>
    </div>
  )
}

export function NetBalanceCard({
  netWorth,
  month,
  monthLabel,
  accountSummary,
}: {
  netWorth: NetWorth
  month: { income: Centavos; expense: Centavos }
  monthLabel: string
  accountSummary: string
}) {
  return (
    <section className="card p-5">
      <p className="label">Net balance</p>
      <Money
        value={netWorth.total}
        className="my-1 block text-hero font-bold"
      />
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-ctl bg-primary-soft p-3">
          <p className="text-meta text-muted">Income · {monthLabel}</p>
          <Money
            value={month.income}
            tone="positive"
            signed
            compact
            className="mt-0.5 block text-lg font-semibold"
          />
        </div>
        <div className="rounded-ctl bg-negative-soft p-3">
          <p className="text-meta text-muted">Spent · {monthLabel}</p>
          <Money
            value={-month.expense}
            tone="negative"
            compact
            className="mt-0.5 block text-lg font-semibold"
          />
        </div>
      </div>
      <Link
        to="/accounts"
        className="mt-3 flex min-h-touch items-center justify-between font-medium text-ink no-underline"
      >
        {accountSummary}
        <ChevronRightIcon size={18} />
      </Link>
    </section>
  )
}

export function BudgetCard({ budget, monthLabel }: { budget: BudgetSummary; monthLabel: string }) {
  const over = budget.remaining < 0

  return (
    <section className="card">
      <SectionHeader title={`${monthLabel} budget`} to="/budgets" action="Details" />
      <div className="mb-2 flex items-baseline justify-between">
        <p className="num text-xl font-semibold">
          <Money value={budget.spent} compact />
          <span className="ml-1 text-sm font-normal text-muted">
            of {formatMoney(budget.limit, { compact: true })}
          </span>
        </p>
        <p className="text-meta text-muted">{formatPercent(budget.share)}</p>
      </div>
      <Meter value={budget.share} color={over ? 'rgb(var(--c-negative))' : undefined} />
      <p className="mt-2.5 text-meta text-muted">
        {over ? (
          <>Over by {formatMoney(-budget.remaining, { compact: true })}</>
        ) : (
          <>
            {formatMoney(budget.remaining, { compact: true })} left
            {budget.perDay !== null && (
              <>
                {' · '}about {formatMoney(budget.perDay, { compact: true })} a day for{' '}
                {budget.daysLeft} {budget.daysLeft === 1 ? 'day' : 'days'}
              </>
            )}
          </>
        )}
      </p>
    </section>
  )
}

export function LoansCard({ loans }: { loans: LoansSummary }) {
  const owingNote = [
    `${loans.peopleOwing} ${loans.peopleOwing === 1 ? 'person' : 'people'}`,
    loans.overdue > 0 ? `${loans.overdue} overdue` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const owedNote = [
    `${loans.peopleOwed} ${loans.peopleOwed === 1 ? 'person' : 'people'}`,
    loans.nextDue ? `due ${relativeDay(loans.nextDue)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section className="card">
      <SectionHeader title="Loans" to="/loans" action="See all" />
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-btn border border-primary/30 p-3">
          <p className="text-meta text-muted">Owed to you</p>
          <Money
            value={loans.owedToYou}
            tone="positive"
            compact
            className="my-0.5 block text-xl font-semibold"
          />
          <p className="text-meta text-muted">{owingNote}</p>
        </div>
        <div className="rounded-btn border border-negative/30 p-3">
          <p className="text-meta text-muted">You owe</p>
          <Money
            value={loans.youOwe}
            tone="negative"
            compact
            className="my-0.5 block text-xl font-semibold"
          />
          <p className="text-meta text-muted">{owedNote}</p>
        </div>
      </div>

      {loans.formal.map((loan) => (
        <Link
          key={loan.id}
          to={`/loans/formal/${loan.id}`}
          className="list-row mt-1.5 text-ink no-underline"
        >
          <CategoryTile color={loan.color} name={loan.title} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{loan.title}</p>
            <Meter value={loan.share} color={loan.color} className="mt-1.5" />
          </div>
          <Money value={loan.remaining} whole className="font-semibold" />
        </Link>
      ))}
    </section>
  )
}

export function BillsCard({ bills }: { bills: BillSummary[] }) {
  return (
    <section className="card">
      <SectionHeader title="Upcoming bills" to="/bills" action="All bills" />
      {bills.length === 0 ? (
        <p className="py-2 text-meta text-muted">No bills scheduled yet.</p>
      ) : (
        bills.map((bill) => (
          <div key={bill.id} className="list-row">
            <CategoryTile color={bill.color} name={String(bill.day)} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{bill.title}</p>
              <p className="text-meta text-muted">{bill.when}</p>
            </div>
            <Money value={bill.amount} compact className="font-semibold" />
          </div>
        ))
      )}
    </section>
  )
}

export function RecentCard({ recent }: { recent: RecentRow[] }) {
  return (
    <section className="card">
      <SectionHeader title="Recent" to="/activity" action="View all" />
      {recent.length === 0 ? (
        <p className="py-2 text-meta text-muted">
          Nothing yet — tap <span aria-hidden="true">+</span> to add your first transaction.
        </p>
      ) : (
        recent.map((row) => (
          <Link key={row.id} to={`/txn/${row.id}`} className="list-row text-ink no-underline">
            <CategoryTile color={row.color} name={row.tileName} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{row.title}</p>
              <p className="truncate text-meta text-muted">{row.subtitle}</p>
            </div>
            <Money value={row.amount} tone={row.tone} signed compact className="font-semibold" />
          </Link>
        ))
      )}
    </section>
  )
}

export function BackupCard({ days }: { days: number | null }) {
  return (
    <section className="card flex items-center gap-3 border-negative/30 bg-negative-soft">
      <span className="row-icon bg-negative/15 text-negative">
        <AlertIcon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {days === null ? 'No backup yet' : `Last backup ${days} days ago`}
        </p>
        <p className="text-meta text-muted">Your data lives only on this device</p>
      </div>
      <Link
        to="/settings/backup"
        className="flex min-h-touch items-center font-semibold text-negative no-underline"
      >
        Back up
      </Link>
    </section>
  )
}
