import type { Transaction } from '@/db/types'
import { toCsv, type CsvValue } from '@/lib/csv'
import { categoryPath, type TxnLookups } from '@/features/transactions/describe'

const HEADERS = [
  'Date',
  'Type',
  'Amount',
  'Category',
  'Account',
  'To account',
  'Note',
  'Tags',
] as const

/**
 * Amounts are written as plain decimal pesos, signed the way the list shows
 * them, so a spreadsheet can sum the column without any cleaning up.
 */
export function transactionsToCsv(
  transactions: readonly Transaction[],
  lookups: TxnLookups,
): string {
  const rows: CsvValue[][] = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((txn) => {
      const signed = txn.type === 'expense' ? -txn.amount : txn.amount
      return [
        txn.date,
        txn.type,
        (signed / 100).toFixed(2),
        categoryPath(txn.categoryId, lookups) ?? '',
        lookups.accountById.get(txn.accountId)?.name ?? '',
        txn.toAccountId ? (lookups.accountById.get(txn.toAccountId)?.name ?? '') : '',
        txn.note,
        txn.tags.join(' '),
      ]
    })

  return toCsv(HEADERS, rows)
}
