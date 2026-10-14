/**
 * Reports (design/Reports.dc.html): spending by category, income against
 * spending over six periods, and the year in review.
 *
 * Everything is derived here so the charts are thin renderers over plain
 * numbers — which also means the figures can be asserted without mounting
 * Recharts.
 */

import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subWeeks,
  subYears,
} from 'date-fns'
import type { Account, Category, Centavos, DateOnly, Id, Loan, Transaction } from '@/db/types'
import { countsAsFlow } from '@/lib/balances'
import { formatPercentDelta, sumMoney } from '@/lib/money'
import { toDateOnly } from '@/lib/dates'
import { MUTED_COLOR } from '@/features/transactions/describe'

export type PeriodKind = 'week' | 'month' | 'year' | 'custom'

export const PERIODS: ReadonlyArray<{ value: PeriodKind; label: string }> = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'custom', label: 'Custom' },
]

export interface Range {
  start: DateOnly
  end: DateOnly
  /** "Oct 2026", "13–19 Oct", "2026". */
  label: string
}

/** Rows beyond this many slices collapse into "Other". */
export const TOP_SLICES = 5

/** Colours for the donut, in order. The last one is always "Other". */
export const OTHER_COLOR = '#A9AEA6'

const weekOptions = { weekStartsOn: 1 } as const

/**
 * The range a period covers, `back` periods ago. Weeks run Monday to Sunday,
 * which is how the calendar screen draws them too.
 */
export function periodRange(kind: PeriodKind, today: Date, back = 0): Range {
  if (kind === 'week') {
    const anchor = subWeeks(today, back)
    const start = startOfWeek(anchor, weekOptions)
    const end = endOfWeek(anchor, weekOptions)
    return {
      start: toDateOnly(start),
      end: toDateOnly(end),
      label:
        start.getMonth() === end.getMonth()
          ? `${format(start, 'd')}–${format(end, 'd MMM')}`
          : `${format(start, 'd MMM')} – ${format(end, 'd MMM')}`,
    }
  }

  if (kind === 'year') {
    const anchor = subYears(today, back)
    return {
      start: toDateOnly(startOfYear(anchor)),
      end: toDateOnly(endOfYear(anchor)),
      label: format(anchor, 'yyyy'),
    }
  }

  const anchor = subMonths(today, back)
  return {
    start: toDateOnly(startOfMonth(anchor)),
    end: toDateOnly(endOfMonth(anchor)),
    label: format(anchor, 'MMM yyyy'),
  }
}

/** A range the user typed. Reversed dates are swapped rather than refused. */
export function customRange(start: DateOnly, end: DateOnly): Range {
  const [from, to] = start <= end ? [start, end] : [end, start]
  return {
    start: from,
    end: to,
    label: `${format(parseISO(from), 'd MMM')} – ${format(parseISO(to), 'd MMM yyyy')}`,
  }
}

export const within = (txn: Transaction, range: Range): boolean =>
  txn.date >= range.start && txn.date <= range.end

export interface Slice {
  categoryId: Id | null
  name: string
  color: string
  amount: Centavos
  /** 0–1 of the period's spend. */
  share: number
  /** "+12%", "−8%", "new" against the period before. */
  delta: string
  /** Spending less than before is the good direction. */
  improving: boolean
}

export interface TrendPoint {
  label: string
  income: Centavos
  expense: Centavos
  /** income − expense */
  saved: Centavos
  /** The period on screen. */
  current: boolean
}

export interface ReportsView {
  range: Range
  previous: Range
  spent: Centavos
  income: Centavos
  slices: Slice[]
  trend: TrendPoint[]
  /** Mean saved across the trend periods that had any activity. */
  averageSaved: Centavos
  /** How many of the six periods that was — the rest had nothing in them. */
  periodsCounted: number
  /** How the period's spend compares with the one before. */
  spentDelta: string
}

export interface ReportsInput {
  transactions: readonly Transaction[]
  categories: readonly Category[]
}

/**
 * Spend per top-level category: an entry on Groceries counts towards Food,
 * because that is the level the user thinks in.
 */
function rollUp(
  transactions: readonly Transaction[],
  range: Range,
  categories: readonly Category[],
): Map<Id | null, Centavos> {
  const parentOf = new Map(
    categories.map((category) => [category.id, category.parentId ?? category.id]),
  )
  const totals = new Map<Id | null, Centavos>()

  for (const txn of transactions) {
    if (!countsAsFlow(txn) || txn.type !== 'expense' || !within(txn, range)) continue
    const key = txn.categoryId ? (parentOf.get(txn.categoryId) ?? txn.categoryId) : null
    totals.set(key, (totals.get(key) ?? 0) + txn.amount)
  }

  return totals
}

function incomeIn(transactions: readonly Transaction[], range: Range): Centavos {
  return sumMoney(
    transactions
      .filter((txn) => countsAsFlow(txn) && txn.type === 'income' && within(txn, range))
      .map((txn) => txn.amount),
  )
}

function spentIn(transactions: readonly Transaction[], range: Range): Centavos {
  return sumMoney(
    transactions
      .filter((txn) => countsAsFlow(txn) && txn.type === 'expense' && within(txn, range))
      .map((txn) => txn.amount),
  )
}

export function buildReports(
  { transactions, categories }: ReportsInput,
  kind: PeriodKind,
  today: Date = new Date(),
  custom?: Range,
): ReportsView {
  const range = kind === 'custom' && custom ? custom : periodRange(kind, today, 0)
  // A custom range has no natural predecessor, so it is compared with the
  // month before it rather than left without a baseline.
  const previous =
    kind === 'custom' && custom
      ? periodRange('month', parseISO(custom.start), 1)
      : periodRange(kind, today, 1)

  const now = rollUp(transactions, range, categories)
  const before = rollUp(transactions, previous, categories)
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const spent = sumMoney([...now.values()])

  const ranked = [...now.entries()]
    .filter(([, amount]) => amount > 0)
    .sort(([, a], [, b]) => b - a)

  const head = ranked.slice(0, TOP_SLICES)
  const tail = ranked.slice(TOP_SLICES)

  const slice = (
    categoryId: Id | null,
    amount: Centavos,
    was: Centavos,
    name?: string,
    color?: string,
  ): Slice => {
    const category = categoryId ? categoryById.get(categoryId) : undefined
    return {
      categoryId,
      name: name ?? category?.name ?? 'Uncategorised',
      color: color ?? category?.color ?? MUTED_COLOR,
      amount,
      share: spent === 0 ? 0 : amount / spent,
      delta: formatPercentDelta(amount, was),
      improving: amount < was,
    }
  }

  const slices = head.map(([categoryId, amount]) =>
    slice(categoryId, amount, before.get(categoryId) ?? 0),
  )

  if (tail.length > 0) {
    const amount = sumMoney(tail.map(([, value]) => value))
    const was = sumMoney(tail.map(([categoryId]) => before.get(categoryId) ?? 0))
    slices.push(slice(null, amount, was, 'Other', OTHER_COLOR))
  }

  // Six periods ending with the one on screen — the mockup's bar chart.
  const trendKind: PeriodKind = kind === 'custom' ? 'month' : kind
  const steps = Array.from({ length: 6 }, (_, index) =>
    periodRange(trendKind, today, 5 - index),
  )

  const trend: TrendPoint[] = steps.map((step, index) => {
    const income = incomeIn(transactions, step)
    const expense = spentIn(transactions, step)
    const start = parseISO(step.start)
    // Weeks are labelled by the day they start on, with the month named
    // only where it turns — six "Sep"s in a row say nothing.
    const sameMonth =
      index > 0 && step.start.slice(0, 7) === (steps[index - 1]?.start ?? '').slice(0, 7)

    return {
      label:
        trendKind === 'year'
          ? step.label
          : trendKind === 'week'
            ? format(start, sameMonth ? 'd' : 'd MMM')
            : format(start, 'MMM'),
      income,
      expense,
      saved: income - expense,
      current: index === 5,
    }
  })

  // Periods with nothing recorded are left out of the average: dividing by
  // six when four of them predate the ledger understates every month.
  const active = trend.filter((point) => point.income !== 0 || point.expense !== 0)

  return {
    range,
    previous,
    spent,
    income: incomeIn(transactions, range),
    slices,
    trend,
    averageSaved:
      active.length === 0
        ? 0
        : Math.round(sumMoney(active.map((point) => point.saved)) / active.length),
    periodsCounted: active.length,
    spentDelta: formatPercentDelta(spent, sumMoney([...before.values()])),
  }
}

export interface YearHighlight {
  year: number
  income: Centavos
  spent: Centavos
  saved: Centavos
  /** Top five categories for the year. */
  top: Slice[]
  /** The five largest single expenses. */
  biggest: Array<{ id: Id; title: string; amount: Centavos; date: DateOnly; account?: string }>
  loansSettled: number
  /** The month with the least spending. */
  leanestMonth?: string
}

/** The "Year in review" sheet. */
export function buildYearInReview(
  {
    transactions,
    categories,
    accounts,
    loans,
  }: ReportsInput & { accounts: readonly Account[]; loans: readonly Loan[] },
  year: number,
  today: Date = new Date(),
): YearHighlight {
  const range: Range = {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    label: String(year),
  }

  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const spend = rollUp(transactions, range, categories)
  const spent = sumMoney([...spend.values()])
  const income = incomeIn(transactions, range)

  const top: Slice[] = [...spend.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, TOP_SLICES)
    .map(([categoryId, amount]) => {
      const category = categoryId ? categoryById.get(categoryId) : undefined
      return {
        categoryId,
        name: category?.name ?? 'Uncategorised',
        color: category?.color ?? MUTED_COLOR,
        amount,
        share: spent === 0 ? 0 : amount / spent,
        delta: '',
        improving: false,
      }
    })

  const biggest = transactions
    .filter((txn) => countsAsFlow(txn) && txn.type === 'expense' && within(txn, range))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((txn) => ({
      id: txn.id,
      title: txn.note || categoryById.get(txn.categoryId ?? '')?.name || 'Expense',
      amount: txn.amount,
      date: txn.date,
      ...(accountById.get(txn.accountId)?.name
        ? { account: accountById.get(txn.accountId)?.name as string }
        : {}),
    }))

  // The month in progress is not a fair comparison against whole ones, so
  // it cannot win "leanest" on the strength of being half over.
  const partial = format(today, 'yyyy-MM')
  const byMonth = new Map<string, Centavos>()
  for (const txn of transactions) {
    if (!countsAsFlow(txn) || txn.type !== 'expense' || !within(txn, range)) continue
    const key = txn.date.slice(0, 7)
    if (key === partial) continue
    byMonth.set(key, (byMonth.get(key) ?? 0) + txn.amount)
  }
  const leanest = [...byMonth.entries()].sort(([, a], [, b]) => a - b)[0]

  return {
    year,
    income,
    spent,
    saved: income - spent,
    top,
    biggest,
    loansSettled: loans.filter(
      (loan) => loan.status === 'settled' && loan.startDate.slice(0, 4) === String(year),
    ).length,
    ...(leanest ? { leanestMonth: format(parseISO(`${leanest[0]}-01`), 'MMMM') } : {}),
  }
}
