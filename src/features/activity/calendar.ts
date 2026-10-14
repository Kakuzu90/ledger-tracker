/**
 * The month heatmap in design/Calendar.dc.html: one cell per day, shaded by
 * how much was spent, with a dot where a bill falls due.
 */

import { getDay, getDaysInMonth, parseISO } from 'date-fns'
import type { Centavos, DateOnly, MonthKey, Recurring, Transaction } from '@/db/types'
import { countsAsFlow, monthOf } from '@/lib/balances'
import { toDateOnly } from '@/lib/dates'

/** 0 = nothing spent, 1–4 = quartiles of the month's spending days. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4

export interface DayCell {
  date: DateOnly
  day: number
  spent: Centavos
  income: Centavos
  level: HeatLevel
  hasBill: boolean
  isToday: boolean
  isFuture: boolean
}

export interface MonthGrid {
  month: MonthKey
  /** Leading blanks so the first day lands on the right weekday. */
  leading: number
  cells: DayCell[]
  totalSpent: Centavos
  totalIncome: Centavos
}

/**
 * Thresholds from the days that actually had spending, so one ₱15,000 rent
 * day does not flatten every other day to the lightest shade.
 */
function levelFor(spent: Centavos, sortedSpends: readonly Centavos[]): HeatLevel {
  if (spent <= 0 || sortedSpends.length === 0) return 0

  const at = (fraction: number): Centavos =>
    sortedSpends[Math.min(sortedSpends.length - 1, Math.floor(sortedSpends.length * fraction))] ?? 0

  if (spent >= at(0.75)) return 4
  if (spent >= at(0.5)) return 3
  if (spent >= at(0.25)) return 2
  return 1
}

export function buildMonthGrid(
  month: MonthKey,
  transactions: readonly Transaction[],
  recurring: readonly Recurring[],
  today: Date = new Date(),
): MonthGrid {
  const first = parseISO(`${month}-01`)
  const days = getDaysInMonth(first)
  const todayIso = toDateOnly(today)

  const spentByDay = new Map<DateOnly, Centavos>()
  const incomeByDay = new Map<DateOnly, Centavos>()
  let totalSpent = 0
  let totalIncome = 0

  for (const txn of transactions) {
    // Same rule as the home and activity totals: transfers move money
    // sideways and loan principal is not spending, so neither shades a day.
    if (!countsAsFlow(txn)) continue
    if (monthOf(txn.date) !== month) continue

    if (txn.type === 'expense') {
      spentByDay.set(txn.date, (spentByDay.get(txn.date) ?? 0) + txn.amount)
      totalSpent += txn.amount
    } else {
      incomeByDay.set(txn.date, (incomeByDay.get(txn.date) ?? 0) + txn.amount)
      totalIncome += txn.amount
    }
  }

  const billDays = new Set(
    recurring.filter((rule) => monthOf(rule.nextDate) === month).map((rule) => rule.nextDate),
  )

  const sortedSpends = [...spentByDay.values()].sort((a, b) => a - b)

  const cells: DayCell[] = Array.from({ length: days }, (_, index) => {
    const day = index + 1
    const date = `${month}-${String(day).padStart(2, '0')}`
    const spent = spentByDay.get(date) ?? 0

    return {
      date,
      day,
      spent,
      income: incomeByDay.get(date) ?? 0,
      level: levelFor(spent, sortedSpends),
      hasBill: billDays.has(date),
      isToday: date === todayIso,
      isFuture: date > todayIso,
    }
  })

  // The grid starts on Monday, as the mockup's weekday row does.
  const weekday = getDay(first)
  const leading = (weekday + 6) % 7

  return { month, leading, cells, totalSpent, totalIncome }
}

/** The month before or after, as a key. */
export function shiftMonth(month: MonthKey, by: number): MonthKey {
  const [year = 0, index = 1] = month.split('-').map(Number)
  const date = new Date(year, index - 1 + by, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** The day to show below the grid: today if it is in view, else the busiest. */
export function defaultSelectedDay(grid: MonthGrid, today: Date = new Date()): DateOnly | null {
  const todayCell = grid.cells.find((cell) => cell.date === toDateOnly(today))
  if (todayCell) return todayCell.date

  const busiest = [...grid.cells]
    .filter((cell) => cell.spent > 0 || cell.income > 0)
    .sort((a, b) => b.spent + b.income - (a.spent + a.income))[0]

  return busiest?.date ?? null
}
