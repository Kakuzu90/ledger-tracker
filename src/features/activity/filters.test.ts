import { describe, expect, it } from 'vitest'
import {
  activeFilterCount,
  applyFilters,
  availableMonths,
  emptyFilters,
  groupByDay,
  summarize,
  tagCounts,
  type ActivityFilters,
} from './filters'
import { buildLookups } from '@/features/transactions/describe'
import type { Account, Category, Transaction } from '@/db/types'

const stamps = { createdAt: '2026-10-14T01:00:00.000Z', updatedAt: '2026-10-14T01:00:00.000Z' }

const categories: Category[] = [
  { id: 'food', name: 'Food', kind: 'expense', color: '#E07A3F', order: 0, archived: false, ...stamps },
  { id: 'groceries', name: 'Groceries', kind: 'expense', parentId: 'food', color: '#E07A3F', order: 0, archived: false, ...stamps },
  { id: 'transport', name: 'Transport', kind: 'expense', color: '#1D4E89', order: 1, archived: false, ...stamps },
  { id: 'salary', name: 'Salary', kind: 'income', color: '#0F6E64', order: 0, archived: false, ...stamps },
]

const accounts: Account[] = [
  { id: 'gcash', name: 'GCash', type: 'ewallet', currency: 'PHP', openingBalance: 0, color: '#2C6E8A', archived: false, ...stamps },
  { id: 'bpi', name: 'BPI Savings', type: 'bank', currency: 'PHP', openingBalance: 0, color: '#1D4E89', archived: false, ...stamps },
  { id: 'cash', name: 'Cash', type: 'cash', currency: 'PHP', openingBalance: 0, color: '#7A6A3F', archived: false, ...stamps },
]

const lookups = buildLookups(categories, accounts)

const txn = (over: Partial<Transaction> & Pick<Transaction, 'id'>): Transaction => ({
  type: 'expense',
  amount: 100_00,
  accountId: 'gcash',
  date: '2026-10-14',
  note: '',
  tags: [],
  status: 'posted',
  ...stamps,
  ...over,
})

const rows: Transaction[] = [
  txn({ id: 'lunch', amount: 289_00, categoryId: 'food', note: 'Lunch with team', tags: ['work'] }),
  txn({ id: 'ride', amount: 214_00, categoryId: 'transport', note: 'Ride to office' }),
  txn({
    id: 'groceries',
    amount: 2_145_00,
    categoryId: 'groceries',
    accountId: 'cash',
    date: '2026-10-13',
    note: 'SM Supermarket',
    tags: ['weekly', 'household'],
    receiptId: 'r1',
  }),
  txn({ id: 'salary', type: 'income', amount: 26_000_00, categoryId: 'salary', accountId: 'bpi', date: '2026-10-13', note: 'Salary' }),
  txn({ id: 'transfer', type: 'transfer', amount: 2_000_00, accountId: 'bpi', toAccountId: 'gcash', date: '2026-10-12', note: 'Top up' }),
  txn({ id: 'september', amount: 500_00, categoryId: 'food', date: '2026-09-28', note: 'Old coffee' }),
  txn({ id: 'pending', amount: 149_00, categoryId: 'food', note: 'Spotify', status: 'pending' }),
  txn({ id: 'lent', amount: 3_500_00, date: '2026-10-14', note: 'Phone repair', loanId: 'loan-1' }),
]

const filters = (over: Partial<ActivityFilters> = {}): ActivityFilters => ({
  ...emptyFilters('2026-10'),
  ...over,
})

const ids = (result: Transaction[]) => result.map((t) => t.id)

describe('applyFilters', () => {
  it('keeps the chosen month and drops the rest', () => {
    expect(ids(applyFilters(rows, filters(), lookups))).not.toContain('september')
  })

  it('takes every month when asked', () => {
    expect(ids(applyFilters(rows, filters({ month: 'all' }), lookups))).toContain('september')
  })

  it('never shows a pending row in the list', () => {
    // Pending recurring entries have their own strip above the list.
    expect(ids(applyFilters(rows, filters({ month: 'all' }), lookups))).not.toContain('pending')
  })

  describe('search', () => {
    it('matches a note, case-insensitively', () => {
      expect(ids(applyFilters(rows, filters({ query: 'supermarket' }), lookups))).toEqual([
        'groceries',
      ])
    })

    it('matches a tag with or without the hash', () => {
      expect(ids(applyFilters(rows, filters({ query: '#work' }), lookups))).toEqual(['lunch'])
      expect(ids(applyFilters(rows, filters({ query: 'work' }), lookups))).toEqual(['lunch'])
    })

    it('matches a category name', () => {
      expect(ids(applyFilters(rows, filters({ query: 'transport' }), lookups))).toEqual(['ride'])
    })

    it('matches an account name, including a transfer destination', () => {
      const found = ids(applyFilters(rows, filters({ query: 'BPI' }), lookups))
      expect(found).toContain('salary')
      expect(found).toContain('transfer')
    })

    it('ignores surrounding whitespace', () => {
      expect(ids(applyFilters(rows, filters({ query: '  lunch  ' }), lookups))).toEqual(['lunch'])
    })

    it('returns everything for an empty query', () => {
      expect(applyFilters(rows, filters({ query: '' }), lookups)).toHaveLength(6)
    })

    it('returns nothing when nothing matches', () => {
      expect(applyFilters(rows, filters({ query: 'zzz' }), lookups)).toEqual([])
    })
  })

  describe('account filter', () => {
    it('keeps only the chosen accounts', () => {
      expect(ids(applyFilters(rows, filters({ accountIds: ['cash'] }), lookups))).toEqual([
        'groceries',
      ])
    })

    it('matches a transfer on either side', () => {
      const out = ids(applyFilters(rows, filters({ accountIds: ['gcash'] }), lookups))
      expect(out).toContain('transfer')
    })
  })

  describe('category filter', () => {
    it('keeps only the chosen categories', () => {
      expect(ids(applyFilters(rows, filters({ categoryIds: ['transport'] }), lookups))).toEqual([
        'ride',
      ])
    })

    it('includes subcategories when the parent is chosen', () => {
      // Filtering by Food must bring back the Groceries entry too.
      const out = ids(applyFilters(rows, filters({ categoryIds: ['food'] }), lookups))
      expect(out).toEqual(['lunch', 'groceries'])
    })

    it('drops uncategorised entries', () => {
      const withTransfer = applyFilters(rows, filters({ categoryIds: ['food'] }), lookups)
      expect(ids(withTransfer)).not.toContain('transfer')
    })
  })

  describe('tag filter', () => {
    it('matches any of the chosen tags', () => {
      expect(ids(applyFilters(rows, filters({ tags: ['weekly'] }), lookups))).toEqual([
        'groceries',
      ])
      expect(
        ids(applyFilters(rows, filters({ tags: ['work', 'weekly'] }), lookups)),
      ).toEqual(['lunch', 'groceries'])
    })
  })

  describe('amount filter', () => {
    it('applies a floor', () => {
      expect(ids(applyFilters(rows, filters({ min: 1_000_00 }), lookups))).toEqual([
        'groceries',
        'salary',
        'transfer',
        'lent',
      ])
    })

    it('applies a ceiling', () => {
      expect(ids(applyFilters(rows, filters({ max: 250_00 }), lookups))).toEqual(['ride'])
    })

    it('applies both ends inclusively', () => {
      expect(
        ids(applyFilters(rows, filters({ min: 214_00, max: 289_00 }), lookups)),
      ).toEqual(['lunch', 'ride'])
    })
  })

  it('combines filters', () => {
    const result = applyFilters(
      rows,
      filters({ query: 'lunch', categoryIds: ['food'], accountIds: ['gcash'] }),
      lookups,
    )
    expect(ids(result)).toEqual(['lunch'])
  })
})

describe('activeFilterCount', () => {
  it('ignores the month and the query', () => {
    expect(activeFilterCount(filters({ query: 'x' }))).toBe(0)
  })

  it('counts each narrowed dimension once', () => {
    expect(activeFilterCount(filters({ accountIds: ['gcash'], tags: ['work'] }))).toBe(2)
    expect(activeFilterCount(filters({ min: 100 }))).toBe(1)
    expect(activeFilterCount(filters({ min: 100, max: 200 }))).toBe(1)
  })
})

describe('groupByDay', () => {
  const groups = groupByDay(applyFilters(rows, filters(), lookups))

  it('groups into days, newest first', () => {
    expect(groups.map((g) => g.date)).toEqual(['2026-10-14', '2026-10-13', '2026-10-12'])
  })

  it('nets each day, loan movements aside', () => {
    expect(groups[0]?.net).toBe(-503_00)
    expect(groups[1]?.net).toBe(23_855_00)
  })

  it('leaves a transfer out of the day net', () => {
    // ₱2,000 moved between the user's own accounts changes nothing.
    expect(groups[2]?.net).toBe(0)
  })
})

describe('summarize', () => {
  it('totals in, out and the difference', () => {
    expect(summarize(applyFilters(rows, filters(), lookups))).toEqual({
      income: 26_000_00,
      expense: 2_648_00,
      net: 23_352_00,
    })
  })

  it('leaves loan principal out, so the figures agree with the home screen', () => {
    // The ₱3,500 lent to Juan is money moved, not money spent. It is still
    // listed — it just must not make October read as two different months
    // depending on which screen you are on.
    const visible = applyFilters(rows, filters(), lookups)
    expect(visible.map((t) => t.id)).toContain('lent')
    expect(summarize(visible).expense).toBe(2_648_00)
  })

  it('is zero for nothing', () => {
    expect(summarize([])).toEqual({ income: 0, expense: 0, net: 0 })
  })
})

describe('availableMonths', () => {
  it('lists months that have entries, newest first', () => {
    expect(availableMonths(rows)).toEqual(['2026-10', '2026-09'])
  })
})

describe('tagCounts', () => {
  it('counts each tag', () => {
    expect([...tagCounts(rows).entries()]).toEqual([
      ['household', 1],
      ['weekly', 1],
      ['work', 1],
    ])
  })
})
