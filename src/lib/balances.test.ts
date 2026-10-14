import { describe, expect, it } from 'vitest'
import {
  accountBalance,
  accountDelta,
  categorySpend,
  countsAsFlow,
  creditAvailable,
  monthOf,
  monthTotals,
  netWorth,
  spendForCategoryTree,
} from './balances'
import type { Account, Transaction } from '@/db/types'

const stamps = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }

const account = (over: Partial<Account> & Pick<Account, 'id'>): Account => ({
  name: 'Account',
  type: 'bank',
  currency: 'PHP',
  openingBalance: 0,
  color: '#000000',
  archived: false,
  ...stamps,
  ...over,
})

const txn = (over: Partial<Transaction> & Pick<Transaction, 'id'>): Transaction => ({
  type: 'expense',
  amount: 0,
  accountId: 'a',
  date: '2026-10-05',
  note: '',
  tags: [],
  status: 'posted',
  ...stamps,
  ...over,
})

describe('monthOf', () => {
  it('takes the month key off a date', () => {
    expect(monthOf('2026-10-14')).toBe('2026-10')
  })
})

describe('accountDelta', () => {
  it('subtracts an expense from its account', () => {
    expect(accountDelta(txn({ id: '1', type: 'expense', amount: 500, accountId: 'a' }), 'a')).toBe(
      -500,
    )
  })

  it('adds income to its account', () => {
    expect(accountDelta(txn({ id: '1', type: 'income', amount: 500, accountId: 'a' }), 'a')).toBe(
      500,
    )
  })

  it('moves a transfer out of one account and into the other', () => {
    const transfer = txn({
      id: '1',
      type: 'transfer',
      amount: 2_000_00,
      accountId: 'a',
      toAccountId: 'b',
    })
    expect(accountDelta(transfer, 'a')).toBe(-2_000_00)
    expect(accountDelta(transfer, 'b')).toBe(2_000_00)
    expect(accountDelta(transfer, 'c')).toBe(0)
  })

  it('ignores accounts the transaction does not touch', () => {
    expect(accountDelta(txn({ id: '1', amount: 500, accountId: 'a' }), 'z')).toBe(0)
  })
})

describe('accountBalance', () => {
  it('is the opening balance plus every posted movement', () => {
    const balance = accountBalance(account({ id: 'a', openingBalance: 10_000_00 }), [
      txn({ id: '1', type: 'expense', amount: 2_500_00, accountId: 'a' }),
      txn({ id: '2', type: 'income', amount: 1_000_00, accountId: 'a' }),
    ])
    expect(balance).toBe(8_500_00)
  })

  it('leaves pending rows out until they are confirmed', () => {
    const balance = accountBalance(account({ id: 'a', openingBalance: 1_000_00 }), [
      txn({ id: '1', type: 'expense', amount: 149_00, accountId: 'a', status: 'pending' }),
    ])
    expect(balance).toBe(1_000_00)
  })
})

describe('netWorth', () => {
  const accounts = [
    account({ id: 'bank', type: 'bank', openingBalance: 58_420_00 }),
    account({ id: 'cash', type: 'cash', openingBalance: 3_250_00 }),
    account({ id: 'visa', type: 'credit', openingBalance: -20_480_00, creditLimit: 60_000_00 }),
    account({ id: 'old', type: 'ewallet', openingBalance: 9_999_00, archived: true }),
  ]

  it('nets credit balances off the assets', () => {
    expect(netWorth(accounts, [])).toEqual({
      assets: 61_670_00,
      credit: -20_480_00,
      total: 41_190_00,
    })
  })

  it('leaves archived accounts out', () => {
    // The archived ₱9,999 account would otherwise show up in assets.
    expect(netWorth(accounts, []).assets).toBe(61_670_00)
  })
})

describe('creditAvailable', () => {
  it('is the limit less what is owed', () => {
    const visa = account({ id: 'visa', type: 'credit', creditLimit: 60_000_00 })
    expect(creditAvailable(visa, -20_480_00)).toBe(39_520_00)
  })

  it('is zero headroom when no limit is set', () => {
    expect(creditAvailable(account({ id: 'visa', type: 'credit' }), 0)).toBe(0)
  })
})

describe('countsAsFlow', () => {
  it('excludes transfers, loan movements and pending rows', () => {
    expect(countsAsFlow(txn({ id: '1', type: 'transfer', toAccountId: 'b' }))).toBe(false)
    expect(countsAsFlow(txn({ id: '2', loanId: 'loan-1' }))).toBe(false)
    expect(countsAsFlow(txn({ id: '3', status: 'pending' }))).toBe(false)
    expect(countsAsFlow(txn({ id: '4' }))).toBe(true)
  })
})

describe('monthTotals', () => {
  const rows = [
    txn({ id: '1', type: 'income', amount: 26_000_00, date: '2026-10-13' }),
    txn({ id: '2', type: 'expense', amount: 2_145_00, date: '2026-10-13' }),
    txn({ id: '3', type: 'expense', amount: 289_00, date: '2026-10-14' }),
    txn({ id: '4', type: 'expense', amount: 1_000_00, date: '2026-09-30' }),
    txn({ id: '5', type: 'transfer', amount: 2_000_00, toAccountId: 'b', date: '2026-10-12' }),
    txn({ id: '6', type: 'income', amount: 1_000_00, loanId: 'l1', date: '2026-10-05' }),
  ]

  it('sums the month and nets it', () => {
    expect(monthTotals(rows, '2026-10')).toEqual({
      income: 26_000_00,
      expense: 2_434_00,
      net: 23_566_00,
    })
  })

  it('counts neither transfers nor loan principal as income or expense', () => {
    // Row 5 moves ₱2,000 between the user's own accounts; row 6 is Juan paying
    // back a loan. Neither is money earned or spent.
    const totals = monthTotals(rows, '2026-10')
    expect(totals.income).toBe(26_000_00)
    expect(totals.expense).toBe(2_434_00)
  })

  it('is zero for a month with nothing in it', () => {
    expect(monthTotals(rows, '2026-01')).toEqual({ income: 0, expense: 0, net: 0 })
  })
})

describe('categorySpend', () => {
  const rows = [
    txn({ id: '1', amount: 289_00, categoryId: 'food', date: '2026-10-14' }),
    txn({ id: '2', amount: 2_145_00, categoryId: 'groceries', date: '2026-10-13' }),
    txn({ id: '3', amount: 600_00, date: '2026-10-09' }),
    txn({ id: '4', amount: 999_00, categoryId: 'food', date: '2026-09-09' }),
  ]

  it('totals each category for the month', () => {
    const spend = categorySpend(rows, '2026-10')
    expect(spend.get('food')).toBe(289_00)
    expect(spend.get('groceries')).toBe(2_145_00)
  })

  it('collects uncategorised spend under null', () => {
    expect(categorySpend(rows, '2026-10').get(null)).toBe(600_00)
  })
})

describe('spendForCategoryTree', () => {
  it('rolls subcategory spend up into the parent', () => {
    const spend = new Map([
      ['food', 289_00],
      ['groceries', 2_145_00],
      ['dining', 5_000_00],
    ])
    const children = new Map([['food', ['groceries', 'dining']]])
    expect(spendForCategoryTree(spend, 'food', children)).toBe(7_434_00)
  })

  it('is just the category when it has no children', () => {
    expect(spendForCategoryTree(new Map([['health', 600_00]]), 'health', new Map())).toBe(600_00)
  })
})
