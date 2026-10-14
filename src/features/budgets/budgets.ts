/**
 * The budgets screen as data (design/Budgets.dc.html): the month's totals,
 * a line per budgeted category, and the savings goals.
 *
 * All of it derives from `src/lib/budgets.ts`; this module only resolves
 * names, colours and the sentences that go under each figure.
 */

import {
  differenceInCalendarMonths,
  format,
  lastDayOfMonth,
  parse,
  parseISO,
} from 'date-fns'
import type { Budget, Category, Centavos, Goal, Id, MonthKey, Transaction } from '@/db/types'
import {
  buildBudgets,
  onPaceFor,
  previousMonth,
  type BudgetLine,
  type BudgetInput,
} from '@/lib/budgets'
import { clampShare, ratio } from '@/lib/money'
import { MUTED_COLOR } from '@/features/transactions/describe'

export interface BudgetRow extends BudgetLine {
  name: string
  color: string
  /** "₱2,000 + ₱400 from Sep", when something rolled over. */
  carryNote?: string
}

export interface GoalCard {
  goal: Goal
  /** 0–1, clamped: a goal cannot be more than reached. */
  share: number
  remaining: Centavos
  /** What it takes a month to land on the deadline, when there is one. */
  perMonth?: Centavos
  /** "₱7,600/mo to reach by Mar 2027", "No deadline", "Reached". */
  note: string
  reached: boolean
}

export interface BudgetsView {
  month: MonthKey
  /** "October 2026" */
  monthLabel: string
  overall: BudgetLine | null
  /** Days left in the month, counting today — 0 for a month already past. */
  daysLeft: number
  /** Where the month lands at this rate, or null without a budget. */
  onPace: Centavos | null
  categories: BudgetRow[]
  unbudgeted: Centavos
  goals: GoalCard[]
}

export interface BudgetsInput {
  month: MonthKey
  budgets: readonly Budget[]
  categories: readonly Category[]
  transactions: readonly Transaction[]
  goals: readonly Goal[]
}

/** Children per parent, which is how a parent's budget covers its subs. */
export function childIdsByParent(
  categories: readonly Category[],
): Map<Id, readonly Id[]> {
  const map = new Map<Id, Id[]>()
  for (const category of categories) {
    if (category.parentId === undefined) continue
    const children = map.get(category.parentId) ?? []
    children.push(category.id)
    map.set(category.parentId, children)
  }
  return map
}

const monthStart = (month: MonthKey): Date => parse(month, 'yyyy-MM', new Date())

/** Days still to come in `month`, counting today. Past months have none. */
export function daysLeftIn(month: MonthKey, today: Date): number {
  const start = monthStart(month)
  const last = lastDayOfMonth(start).getDate()

  if (today < start) return last
  if (format(today, 'yyyy-MM') !== month) return 0
  return last - today.getDate() + 1
}

function goalCard(goal: Goal, today: Date): GoalCard {
  const remaining = Math.max(0, goal.target - goal.saved)
  const reached = remaining === 0
  const share = clampShare(ratio(goal.saved, goal.target))

  if (reached) {
    return { goal, share: 1, remaining: 0, note: 'Reached', reached: true }
  }

  if (goal.deadline === undefined) {
    return { goal, share, remaining, note: 'No deadline', reached: false }
  }

  const months = differenceInCalendarMonths(parseISO(goal.deadline), today)
  if (months <= 0) {
    return { goal, share, remaining, note: 'Deadline passed', reached: false }
  }

  // Rounded up: landing a peso short of a goal is not landing on it.
  const perMonth = Math.ceil(remaining / months / 100) * 100
  return {
    goal,
    share,
    remaining,
    perMonth,
    note: `to reach by ${format(parseISO(goal.deadline), 'MMM yyyy')}`,
    reached: false,
  }
}

export function buildBudgetsView(
  { month, budgets, categories, transactions, goals }: BudgetsInput,
  today: Date = new Date(),
): BudgetsView {
  const input: BudgetInput = {
    budgets,
    transactions,
    childIdsByParent: childIdsByParent(categories),
  }
  const { overall, byCategory, unbudgeted } = buildBudgets(month, input)
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const lastMonth = format(monthStart(previousMonth(month)), 'MMM')

  const daysLeft = daysLeftIn(month, today)
  const dayOfMonth = lastDayOfMonth(monthStart(month)).getDate() - daysLeft + 1

  return {
    month,
    monthLabel: format(monthStart(month), 'MMMM yyyy'),
    overall,
    daysLeft,
    onPace: overall
      ? onPaceFor(overall.spent, dayOfMonth, lastDayOfMonth(monthStart(month)).getDate())
      : null,
    categories: byCategory.map((line) => {
      const category = line.categoryId ? categoryById.get(line.categoryId) : undefined
      return {
        ...line,
        name: category?.name ?? 'Uncategorised',
        color: category?.color ?? MUTED_COLOR,
        ...(line.carry > 0 ? { carryNote: `from ${lastMonth}` } : {}),
      }
    }),
    unbudgeted,
    // Deadlines first, soonest at the front: those are the ones with a
    // clock on them. Dexie hands rows back in uuid order otherwise.
    goals: goals
      .map((goal) => goalCard(goal, today))
      .sort((a, b) => {
        const left = a.goal.deadline ?? '9999'
        const right = b.goal.deadline ?? '9999'
        return left.localeCompare(right) || a.goal.name.localeCompare(b.goal.name)
      }),
  }
}

/** The months offered by the picker: this one, and the eleven before it. */
export function recentMonths(today: Date = new Date(), count = 12): MonthKey[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - index, 1)
    return format(date, 'yyyy-MM')
  })
}

export const monthName = (month: MonthKey): string =>
  format(monthStart(month), 'MMMM yyyy')

export interface BudgetAlerts {
  /** The month as a whole has gone past its limit. */
  overallOver: boolean
  /** Categories past their limit, biggest spend first. */
  over: string[]
  /** Categories close to it. */
  near: string[]
}

/**
 * What a budget alert would be about. The overall budget is kept apart from
 * the categories: a month can be over without any single category being, if
 * the spending fell outside every budget.
 */
export function alertingLines(view: BudgetsView): BudgetAlerts {
  return {
    overallOver: view.overall?.status === 'over',
    over: view.categories.filter((row) => row.status === 'over').map((row) => row.name),
    near: view.categories.filter((row) => row.status === 'near').map((row) => row.name),
  }
}
