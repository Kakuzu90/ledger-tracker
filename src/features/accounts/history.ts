/**
 * One account's transaction history — its statement.
 *
 * Activity can already be filtered to an account, but it answers a
 * different question: it lists what was earned and spent, and prints a
 * transfer as a neutral figure because the money never left the ledger.
 * An account cares about exactly the thing Activity ignores. A transfer
 * out is money gone from here, a transfer in is money arrived, and the
 * number that matters on every row is what it did to *this* balance.
 *
 * So each row carries `delta` (from `accountDelta`, the same rule the
 * balance itself is computed with) and the balance left behind after it.
 * Nothing is stored; this is derived every time, like every other
 * balance in the app (CLAUDE.md § Data rules).
 */

import type { Account, Centavos, DateOnly, Id, Transaction } from '@/db/types'
import { accountBalance, accountDelta } from '@/lib/balances'

export interface HistoryRow {
  transaction: Transaction
  /** What it did to this account: negative out, positive in. */
  delta: Centavos
  /** The account's balance once this row had landed. */
  balance: Centavos
}

export interface HistoryDay {
  date: DateOnly
  rows: HistoryRow[]
  /** The day's net movement on this account. */
  net: Centavos
  /** Where the balance stood at the end of the day. */
  balance: Centavos
}

export interface AccountHistory {
  account: Account
  balance: Centavos
  /** Newest day first, and newest row first within a day. */
  days: HistoryDay[]
  /** Rows in the history, however many days they span. */
  count: number
}

/** Every transaction that touches this account, either end of a transfer. */
export const touchesAccount = (txn: Transaction, accountId: Id): boolean =>
  txn.accountId === accountId || txn.toAccountId === accountId

/**
 * Oldest first, so a running balance can be walked forwards. Within a day
 * the order is the order they were entered — there is no time of day on a
 * transaction, and `createdAt` is the only tiebreak there is.
 */
const oldestFirst = (a: Transaction, b: Transaction): number =>
  a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)

export function buildAccountHistory(
  account: Account,
  transactions: readonly Transaction[],
): AccountHistory {
  const mine = transactions.filter((txn) => touchesAccount(txn, account.id)).sort(oldestFirst)

  // Walked forwards from the opening balance, so every row's balance is
  // the one the account actually stood at after it.
  let running = account.openingBalance
  const rows: HistoryRow[] = mine.map((transaction) => {
    // A pending row is a forecast, not a movement, so it leaves the
    // running balance where it was — same as `accountBalance`.
    const delta = transaction.status === 'posted' ? accountDelta(transaction, account.id) : 0
    running += delta
    return { transaction, delta, balance: running }
  })

  const byDate = new Map<DateOnly, HistoryRow[]>()
  for (const row of rows) {
    byDate.set(row.transaction.date, [...(byDate.get(row.transaction.date) ?? []), row])
  }

  const days = [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, forDay]) => ({
      date,
      rows: [...forDay].reverse(),
      net: forDay.reduce((total, row) => total + row.delta, 0),
      // The last of the day in chronological order, which is where the
      // account stood when the day ended.
      balance: forDay[forDay.length - 1]?.balance ?? account.openingBalance,
    }))

  return {
    account,
    balance: accountBalance(account, transactions),
    days,
    count: rows.length,
  }
}

/**
 * Where the other side of a transfer is, for the subtitle. Returns
 * undefined for anything that is not a transfer touching this account.
 */
export function transferCounterpart(
  txn: Transaction,
  accountId: Id,
): { id: Id; direction: 'in' | 'out' } | undefined {
  if (txn.type !== 'transfer') return undefined
  if (txn.accountId === accountId && txn.toAccountId) {
    return { id: txn.toAccountId, direction: 'out' }
  }
  if (txn.toAccountId === accountId) return { id: txn.accountId, direction: 'in' }
  return undefined
}
