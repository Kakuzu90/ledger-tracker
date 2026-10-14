/**
 * Search, filters and day grouping for the activity list. Pure: the screen
 * holds the filter state, this decides what the state means.
 */

import type { Centavos, DateOnly, Id, MonthKey, Transaction } from '@/db/types'
import { countsAsFlow, monthOf } from '@/lib/balances'
import { categoryPath, type TxnLookups } from '@/features/transactions/describe'

export interface ActivityFilters {
  /** Free text over notes, tags, category and account. */
  query: string
  /** A month key, or every month. */
  month: MonthKey | 'all'
  accountIds: Id[]
  categoryIds: Id[]
  tags: string[]
  /** Inclusive bounds on the absolute amount. */
  min?: Centavos
  max?: Centavos
}

export const emptyFilters = (month: MonthKey | 'all'): ActivityFilters => ({
  query: '',
  month,
  accountIds: [],
  categoryIds: [],
  tags: [],
})

/** How many filters are narrowing the list, ignoring the month. */
export function activeFilterCount(filters: ActivityFilters): number {
  return (
    (filters.accountIds.length > 0 ? 1 : 0) +
    (filters.categoryIds.length > 0 ? 1 : 0) +
    (filters.tags.length > 0 ? 1 : 0) +
    (filters.min !== undefined || filters.max !== undefined ? 1 : 0)
  )
}

/**
 * Text match over the things a person would type: the note, a #tag, the
 * category or the account. A leading # is optional — "#work" and "work"
 * both find the tag.
 */
function matchesQuery(txn: Transaction, query: string, lookups: TxnLookups): boolean {
  const needle = query.trim().toLowerCase().replace(/^#/, '')
  if (needle === '') return true

  const haystack = [
    txn.note,
    ...txn.tags,
    categoryPath(txn.categoryId, lookups) ?? '',
    lookups.accountById.get(txn.accountId)?.name ?? '',
    txn.toAccountId ? (lookups.accountById.get(txn.toAccountId)?.name ?? '') : '',
  ]

  return haystack.some((part) => part.toLowerCase().includes(needle))
}

/**
 * A transaction matches a category filter through its own category or its
 * parent, so filtering by Food also brings back Groceries.
 */
function matchesCategory(
  txn: Transaction,
  categoryIds: readonly Id[],
  lookups: TxnLookups,
): boolean {
  if (categoryIds.length === 0) return true
  if (!txn.categoryId) return false
  if (categoryIds.includes(txn.categoryId)) return true

  const parentId = lookups.categoryById.get(txn.categoryId)?.parentId
  return parentId !== undefined && categoryIds.includes(parentId)
}

export function applyFilters(
  transactions: readonly Transaction[],
  filters: ActivityFilters,
  lookups: TxnLookups,
): Transaction[] {
  return transactions.filter((txn) => {
    if (txn.status !== 'posted') return false
    if (filters.month !== 'all' && monthOf(txn.date) !== filters.month) return false

    if (filters.accountIds.length > 0) {
      const touches =
        filters.accountIds.includes(txn.accountId) ||
        (txn.toAccountId !== undefined && filters.accountIds.includes(txn.toAccountId))
      if (!touches) return false
    }

    if (!matchesCategory(txn, filters.categoryIds, lookups)) return false

    if (filters.tags.length > 0 && !filters.tags.some((tag) => txn.tags.includes(tag))) {
      return false
    }

    if (filters.min !== undefined && txn.amount < filters.min) return false
    if (filters.max !== undefined && txn.amount > filters.max) return false

    return matchesQuery(txn, filters.query, lookups)
  })
}

export interface DayGroup {
  date: DateOnly
  transactions: Transaction[]
  /** Income less expense for the day; transfers net to nothing. */
  net: Centavos
}

/** Newest day first, and newest entry first within a day. */
export function groupByDay(transactions: readonly Transaction[]): DayGroup[] {
  const byDate = new Map<DateOnly, Transaction[]>()

  for (const txn of transactions) {
    byDate.set(txn.date, [...(byDate.get(txn.date) ?? []), txn])
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, rows]) => ({
      date,
      transactions: [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      net: rows.reduce((total, txn) => {
        if (!countsAsFlow(txn)) return total
        return total + (txn.type === 'income' ? txn.amount : -txn.amount)
      }, 0),
    }))
}

export interface ActivitySummary {
  income: Centavos
  expense: Centavos
  net: Centavos
}

/**
 * The in / out / net strip, and the net on each day header.
 *
 * Counts what Home and Reports count: neither transfers (the same money in
 * two places) nor loan principal (borrowed or lent, not earned or spent).
 * The rows themselves still appear in the list — they are real movements —
 * but the headline has to agree with the rest of the app, or October reads
 * as two different months depending on the screen.
 */
export function summarize(transactions: readonly Transaction[]): ActivitySummary {
  let income = 0
  let expense = 0

  for (const txn of transactions) {
    if (!countsAsFlow(txn)) continue
    if (txn.type === 'income') income += txn.amount
    else expense += txn.amount
  }

  return { income, expense, net: income - expense }
}

/** Months that have transactions, newest first, for the month filter. */
export function availableMonths(transactions: readonly Transaction[]): MonthKey[] {
  return [...new Set(transactions.map((txn) => monthOf(txn.date)))].sort((a, b) =>
    b.localeCompare(a),
  )
}

/** Every tag in use, with how many entries carry it. */
export function tagCounts(transactions: readonly Transaction[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const txn of transactions) {
    for (const tag of txn.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return new Map([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)))
}
