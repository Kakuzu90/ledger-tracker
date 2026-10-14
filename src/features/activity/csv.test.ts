import { describe, expect, it } from 'vitest'
import { transactionsToCsv } from './csv'
import { buildLookups } from '@/features/transactions/describe'
import type { Account, Category, Transaction } from '@/db/types'

const stamps = { createdAt: '2026-10-14T01:00:00.000Z', updatedAt: '2026-10-14T01:00:00.000Z' }

const categories: Category[] = [
  { id: 'food', name: 'Food', kind: 'expense', color: '#E07A3F', order: 0, archived: false, ...stamps },
  { id: 'groceries', name: 'Groceries', kind: 'expense', parentId: 'food', color: '#E07A3F', order: 0, archived: false, ...stamps },
]

const accounts: Account[] = [
  { id: 'cash', name: 'Cash', type: 'cash', currency: 'PHP', openingBalance: 0, color: '#7A6A3F', archived: false, ...stamps },
  { id: 'bpi', name: 'BPI Savings', type: 'bank', currency: 'PHP', openingBalance: 0, color: '#1D4E89', archived: false, ...stamps },
]

const lookups = buildLookups(categories, accounts)

const txn = (over: Partial<Transaction> & Pick<Transaction, 'id'>): Transaction => ({
  type: 'expense',
  amount: 100_00,
  accountId: 'cash',
  date: '2026-10-14',
  note: '',
  tags: [],
  status: 'posted',
  ...stamps,
  ...over,
})

const lines = (csv: string) => csv.split('\r\n')

describe('transactionsToCsv', () => {
  it('writes a header row', () => {
    expect(lines(transactionsToCsv([], lookups))[0]).toBe(
      'Date,Type,Amount,Category,Account,To account,Note,Tags',
    )
  })

  it('writes expenses negative and income positive, so the column sums', () => {
    const csv = lines(
      transactionsToCsv(
        [
          txn({ id: 'a', amount: 2_145_00, categoryId: 'groceries', note: 'SM' }),
          txn({ id: 'b', type: 'income', amount: 26_000_00, accountId: 'bpi', note: 'Salary' }),
        ],
        lookups,
      ),
    )

    expect(csv[1]).toContain('-2145.00')
    expect(csv[2]).toContain('26000.00')
  })

  it('writes the full category path', () => {
    const csv = transactionsToCsv([txn({ id: 'a', categoryId: 'groceries' })], lookups)
    expect(csv).toContain('Food › Groceries')
  })

  it('names both sides of a transfer', () => {
    const csv = lines(
      transactionsToCsv(
        [txn({ id: 'a', type: 'transfer', accountId: 'bpi', toAccountId: 'cash' })],
        lookups,
      ),
    )
    expect(csv[1]).toBe('2026-10-14,transfer,100.00,,BPI Savings,Cash,,')
  })

  it('quotes a note containing a comma', () => {
    const csv = transactionsToCsv([txn({ id: 'a', note: 'Lunch, with team' })], lookups)
    expect(csv).toContain('"Lunch, with team"')
  })

  it('writes tags space-separated in one column', () => {
    const csv = transactionsToCsv([txn({ id: 'a', tags: ['work', 'weekly'] })], lookups)
    expect(csv.endsWith('work weekly')).toBe(true)
  })

  it('puts the newest row first', () => {
    const csv = lines(
      transactionsToCsv(
        [
          txn({ id: 'old', date: '2026-10-01', note: 'Older' }),
          txn({ id: 'new', date: '2026-10-14', note: 'Newer' }),
        ],
        lookups,
      ),
    )
    expect(csv[1]).toContain('Newer')
    expect(csv[2]).toContain('Older')
  })

  it('leaves the category blank when there is none', () => {
    const csv = lines(transactionsToCsv([txn({ id: 'a' })], lookups))
    expect(csv[1]).toBe('2026-10-14,expense,-100.00,,Cash,,,')
  })
})
