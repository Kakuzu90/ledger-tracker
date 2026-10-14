/**
 * Balances, month totals and category spend are computed from transactions —
 * never stored (CLAUDE.md § Data rules).
 */

import type { Account, Centavos, Id, MonthKey, Transaction } from '@/db/types'
import { sumMoney } from './money'

/** The month key a date string falls in: `2026-10-14` → `2026-10`. */
export const monthOf = (date: string): MonthKey => date.slice(0, 7)

/** What a transaction does to one account's balance. */
export function accountDelta(txn: Transaction, accountId: Id): Centavos {
  switch (txn.type) {
    case 'expense':
      return txn.accountId === accountId ? -txn.amount : 0
    case 'income':
      return txn.accountId === accountId ? txn.amount : 0
    case 'transfer':
      // Money leaves `accountId` and lands in `toAccountId`.
      if (txn.accountId === accountId) return -txn.amount
      if (txn.toAccountId === accountId) return txn.amount
      return 0
  }
}

/** Opening balance plus every posted movement. Pending rows do not count. */
export function accountBalance(
  account: Account,
  transactions: readonly Transaction[],
): Centavos {
  const moved = transactions
    .filter((txn) => txn.status === 'posted')
    .map((txn) => accountDelta(txn, account.id))
  return account.openingBalance + sumMoney(moved)
}

export interface NetWorth {
  /** Cash, bank and e-wallet balances. */
  assets: Centavos
  /** Credit card balances, as a negative number. */
  credit: Centavos
  /** assets + credit */
  total: Centavos
}

/** Archived accounts are left out — they are no longer part of net worth. */
export function netWorth(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
): NetWorth {
  let assets = 0
  let credit = 0

  for (const account of accounts) {
    if (account.archived) continue
    const balance = accountBalance(account, transactions)
    if (account.type === 'credit') credit += balance
    else assets += balance
  }

  return { assets, credit, total: assets + credit }
}

/** Available headroom on a credit card: limit less what is owed. */
export function creditAvailable(account: Account, balance: Centavos): Centavos {
  return (account.creditLimit ?? 0) + balance
}

/**
 * Transfers move money the owner already had, and loan movements are
 * principal rather than earning or spending, so neither is income or expense.
 */
export function countsAsFlow(txn: Transaction): boolean {
  return txn.type !== 'transfer' && txn.loanId === undefined && txn.status === 'posted'
}

export interface MonthTotals {
  income: Centavos
  expense: Centavos
  /** income − expense */
  net: Centavos
}

export function monthTotals(
  transactions: readonly Transaction[],
  month: MonthKey,
): MonthTotals {
  let income = 0
  let expense = 0

  for (const txn of transactions) {
    if (!countsAsFlow(txn) || monthOf(txn.date) !== month) continue
    if (txn.type === 'income') income += txn.amount
    else expense += txn.amount
  }

  return { income, expense, net: income - expense }
}

/**
 * Spend per category for a month. Uncategorised expenses collect under the
 * `null` key — the "Unbudgeted" / "Other" row in the budget and report screens.
 */
export function categorySpend(
  transactions: readonly Transaction[],
  month: MonthKey,
): Map<Id | null, Centavos> {
  const spend = new Map<Id | null, Centavos>()

  for (const txn of transactions) {
    if (!countsAsFlow(txn) || txn.type !== 'expense') continue
    if (monthOf(txn.date) !== month) continue
    const key = txn.categoryId ?? null
    spend.set(key, (spend.get(key) ?? 0) + txn.amount)
  }

  return spend
}

/**
 * Spend for a category including its subcategories — the budget screen
 * budgets a parent, but entries land on the children.
 */
export function spendForCategoryTree(
  spend: ReadonlyMap<Id | null, Centavos>,
  categoryId: Id,
  childIdsByParent: ReadonlyMap<Id, readonly Id[]>,
): Centavos {
  const children = childIdsByParent.get(categoryId) ?? []
  return (
    (spend.get(categoryId) ?? 0) +
    sumMoney(children.map((childId) => spend.get(childId) ?? 0))
  )
}
