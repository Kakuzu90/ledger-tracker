import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Account, Category, Recurring, Transaction } from '@/db/types'
import { buildLookups, type TxnLookups } from '@/features/transactions/describe'
import { dueRules } from '@/lib/recurring'
import { toDateOnly } from '@/lib/dates'

export interface ActivityData {
  transactions: Transaction[]
  categories: Category[]
  accounts: Account[]
  lookups: TxnLookups
  /** Pending entries waiting on a yes, with the rule that made them. */
  pending: Array<{ transaction: Transaction; rule?: Recurring }>
}

/**
 * The whole table, filtered in memory.
 *
 * Search and the filter chips cut across date, account, category, tags and
 * amount at once; no single index serves that, and for a personal ledger the
 * table is small enough that a scan is faster than juggling cursors.
 */
export function useActivityData(today: Date = new Date()): ActivityData | undefined {
  const todayIso = toDateOnly(today)

  return useLiveQuery(async () => {
    const [transactions, categories, accounts, recurring] = await Promise.all([
      db.transactions.toArray(),
      db.categories.toArray(),
      db.accounts.toArray(),
      db.recurring.toArray(),
    ])

    const due = new Set(dueRules(recurring, todayIso).map((rule) => rule.id))
    const pending = transactions
      .filter((txn) => txn.status === 'pending')
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((transaction) => {
        const rule = recurring.find(
          (r) => r.id === transaction.recurringId && due.has(r.id),
        )
        return { transaction, ...(rule ? { rule } : {}) }
      })

    return {
      transactions,
      categories,
      accounts,
      lookups: buildLookups(categories, accounts),
      pending,
    }
  }, [todayIso])
}
