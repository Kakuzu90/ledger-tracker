/**
 * Budget maths, including rollover.
 *
 * What a budget has left is computed, never stored (CLAUDE.md § Data rules):
 * every figure here comes from the limits the user set and the transactions
 * they recorded. A rollover budget carries forward whatever last month left
 * unspent, chaining back through earlier months for as long as the rule held.
 */

import type { Budget, Centavos, Id, MonthKey, Transaction } from '@/db/types'
import { categorySpend, spendForCategoryTree } from './balances'
import { ratio, sumMoney } from './money'

/** Share of the limit at which a budget starts reading as "near". */
export const NEAR_LIMIT = 0.85

/** How far back a rollover chain is followed. A year is plenty. */
const MAX_CARRY_DEPTH = 12

export type BudgetStatus = 'under' | 'near' | 'over'

export interface BudgetLine {
  /** null is the whole-month budget. */
  categoryId: Id | null
  /** The limit as written for this month. */
  limit: Centavos
  /** Unspent budget brought forward, 0 when the rule is off. */
  carry: Centavos
  /** limit + carry — what is actually available. */
  effective: Centavos
  spent: Centavos
  /** Negative once the budget is blown. */
  remaining: Centavos
  /** 0–1 and beyond: uncapped, so an overspent month reads above 100%. */
  share: number
  rollover: boolean
  status: BudgetStatus
}

export interface BudgetInput {
  budgets: readonly Budget[]
  transactions: readonly Transaction[]
  /** Children per parent category, so a parent's budget covers its subs. */
  childIdsByParent: ReadonlyMap<Id, readonly Id[]>
}

/** The month before `month`, as a key. */
export function previousMonth(month: MonthKey): MonthKey {
  const [year = 0, index = 1] = month.split('-').map(Number)
  const date = new Date(year, index - 2, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

const find = (budgets: readonly Budget[], month: MonthKey, categoryId: Id | null) =>
  budgets.find((budget) => budget.month === month && budget.categoryId === categoryId)

/** What a category actually spent in a month, subcategories included. */
export function spentIn(
  categoryId: Id | null,
  month: MonthKey,
  { transactions, childIdsByParent }: BudgetInput,
): Centavos {
  const spend = categorySpend(transactions, month)
  if (categoryId === null) return sumMoney([...spend.values()])
  return spendForCategoryTree(spend, categoryId, childIdsByParent)
}

/**
 * Unspent budget carried into `month`. Zero unless this month's budget has
 * rollover on; an overspent month carries nothing rather than a debt, which
 * would compound a bad month into a worse one.
 */
export function carryInto(
  categoryId: Id | null,
  month: MonthKey,
  input: BudgetInput,
  depth = MAX_CARRY_DEPTH,
): Centavos {
  const here = find(input.budgets, month, categoryId)
  if (!here?.rollover || depth <= 0) return 0

  const last = previousMonth(month)
  const before = find(input.budgets, last, categoryId)
  if (!before) return 0

  const available = before.limit + carryInto(categoryId, last, input, depth - 1)
  return Math.max(0, available - spentIn(categoryId, last, input))
}

export function statusOf(spent: Centavos, effective: Centavos): BudgetStatus {
  if (effective > 0 && spent > effective) return 'over'
  if (effective > 0 && spent / effective >= NEAR_LIMIT) return 'near'
  return 'under'
}

/** One budget, resolved. Returns null when nothing is budgeted. */
export function budgetLine(
  categoryId: Id | null,
  month: MonthKey,
  input: BudgetInput,
): BudgetLine | null {
  const budget = find(input.budgets, month, categoryId)
  if (!budget) return null

  const carry = carryInto(categoryId, month, input)
  const effective = budget.limit + carry
  const spent = spentIn(categoryId, month, input)

  return {
    categoryId,
    limit: budget.limit,
    carry,
    effective,
    spent,
    remaining: effective - spent,
    share: ratio(spent, effective),
    rollover: budget.rollover,
    status: statusOf(spent, effective),
  }
}

export interface MonthBudgets {
  /** The whole-month budget, if one is set. */
  overall: BudgetLine | null
  byCategory: BudgetLine[]
  /** Spent on categories with no budget of their own, plus uncategorised. */
  unbudgeted: Centavos
}

export function buildBudgets(month: MonthKey, input: BudgetInput): MonthBudgets {
  const lines = input.budgets
    .filter((budget) => budget.month === month && budget.categoryId !== null)
    .map((budget) => budgetLine(budget.categoryId, month, input))
    .filter((line): line is BudgetLine => line !== null)

  // Anything a budgeted parent covers is already counted in its line.
  const covered = new Set<Id>()
  for (const line of lines) {
    if (line.categoryId === null) continue
    covered.add(line.categoryId)
    for (const child of input.childIdsByParent.get(line.categoryId) ?? []) {
      covered.add(child)
    }
  }

  const spend = categorySpend(input.transactions, month)
  const unbudgeted = sumMoney(
    [...spend.entries()]
      .filter(([categoryId]) => categoryId === null || !covered.has(categoryId))
      .map(([, amount]) => amount),
  )

  return {
    overall: budgetLine(null, month, input),
    byCategory: lines.sort((a, b) => b.spent - a.spent),
    unbudgeted,
  }
}

/**
 * Where this month lands if the rest of it looks like the part already
 * spent. A straight run-rate: simple to explain, and wrong in the same
 * direction for everyone.
 *
 * Rounded to whole pesos — it is an estimate, and centavos on it would read
 * as a precision it does not have.
 */
export function onPaceFor(
  spent: Centavos,
  dayOfMonth: number,
  daysInMonth: number,
): Centavos {
  if (dayOfMonth <= 0) return 0
  return Math.round((spent / dayOfMonth) * daysInMonth / 100) * 100
}
