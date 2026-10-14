import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Account, Category, Loan, Transaction } from '@/db/types'

export interface ReportsData {
  transactions: Transaction[]
  categories: Category[]
  accounts: Account[]
  loans: Loan[]
}

/**
 * The whole ledger. Reports slice it by period in memory: the ranges change
 * as the user taps between week, month and year, and no index serves a
 * moving window better than one scan of a few thousand rows.
 */
export function useReportsData(): ReportsData | undefined {
  return useLiveQuery(async () => {
    const [transactions, categories, accounts, loans] = await Promise.all([
      db.transactions.toArray(),
      db.categories.toArray(),
      db.accounts.toArray(),
      db.loans.toArray(),
    ])
    return { transactions, categories, accounts, loans }
  }, [])
}
