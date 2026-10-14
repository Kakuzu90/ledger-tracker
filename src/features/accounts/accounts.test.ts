import { describe, expect, it } from 'vitest'
import { buildAccountsView, canArchive, ordinal, TYPE_LABEL } from './accounts'
import { buildSampleData } from '@/db/sample'
import type { Account, Transaction } from '@/db/types'

const TODAY = new Date(2026, 9, 14)
const sample = buildSampleData({ today: TODAY })
const view = buildAccountsView(sample.accounts, sample.transactions)

const stamps = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }

const account = (over: Partial<Account> & Pick<Account, 'id'>): Account => ({
  name: 'Account',
  type: 'bank',
  currency: 'PHP',
  openingBalance: 0,
  color: '#1D4E89',
  archived: false,
  ...stamps,
  ...over,
})

const txn = (over: Partial<Transaction> & Pick<Transaction, 'id'>): Transaction => ({
  type: 'expense',
  amount: 0,
  accountId: 'a',
  date: '2026-10-14',
  note: '',
  tags: [],
  status: 'posted',
  ...stamps,
  ...over,
})

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [5, '5th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [25, '25th'],
    [31, '31st'],
  ])('renders %i as %s', (day, expected) => {
    expect(ordinal(day)).toBe(expected)
  })
})

describe('buildAccountsView, against the sample ledger', () => {
  it('reports the ₱64,250 net worth from the mockup', () => {
    expect(view.netWorth).toEqual({
      assets: 84_730_00,
      credit: -20_480_00,
      total: 64_250_00,
    })
  })

  it('lists the spending accounts with their balances', () => {
    expect(
      view.spending.map((s) => [s.account.name, s.balance] as const),
    ).toEqual([
      ['BPI Savings', 58_420_00],
      ['GCash', 6_310_00],
      ['Maya', 16_750_00],
      ['Cash', 3_250_00],
    ])
  })

  it('keeps credit cards out of the cash list', () => {
    expect(view.spending.some((s) => s.account.type === 'credit')).toBe(false)
    expect(view.cards).toHaveLength(1)
  })

  it('separates archived accounts from live ones', () => {
    expect(view.archived.map((s) => s.account.name)).toEqual(['Coins.ph', 'Old PayMaya'])
    expect(view.spending.some((s) => s.account.archived)).toBe(false)
  })
})

describe('credit cards', () => {
  const card = view.cards[0]!

  it('shows what is owed as a negative balance', () => {
    expect(card.balance).toBe(-20_480_00)
  })

  it('works out the limit, the headroom and the share used', () => {
    expect(card.limit).toBe(60_000_00)
    expect(card.available).toBe(39_520_00)
    // The mockup draws this bar at 34%.
    expect(Math.round(card.utilization * 100)).toBe(34)
  })

  it('spells out the statement cycle', () => {
    expect(card.cycle).toBe('Statement 5th · due 25th')
  })

  it('leaves the cycle unset when the days are not known', () => {
    const bare = buildAccountsView(
      [account({ id: 'c', type: 'credit', creditLimit: 10_000_00 })],
      [],
    )
    expect(bare.cards[0]?.cycle).toBeUndefined()
  })

  it('does not divide by a missing limit', () => {
    const noLimit = buildAccountsView(
      [account({ id: 'c', type: 'credit', openingBalance: -5_000_00 })],
      [],
    )
    expect(noLimit.cards[0]?.utilization).toBe(0)
    expect(noLimit.cards[0]?.available).toBe(-5_000_00)
  })

  it('reads over 100% once the card is past its limit', () => {
    const over = buildAccountsView(
      [account({ id: 'c', type: 'credit', creditLimit: 10_000_00, openingBalance: -12_000_00 })],
      [],
    )
    expect(over.cards[0]?.utilization).toBeGreaterThan(1)
    expect(over.cards[0]?.available).toBe(-2_000_00)
  })

  it('treats a card paid into credit as nothing owed, not negative usage', () => {
    const ahead = buildAccountsView(
      [account({ id: 'c', type: 'credit', creditLimit: 10_000_00, openingBalance: 500_00 })],
      [],
    )
    expect(ahead.cards[0]?.utilization).toBe(0)
    expect(ahead.cards[0]?.available).toBe(10_500_00)
  })
})

describe('transfers move money between accounts', () => {
  const bpi = account({ id: 'bpi', openingBalance: 10_000_00 })
  const visa = account({ id: 'visa', type: 'credit', creditLimit: 60_000_00, openingBalance: -20_480_00 })

  it('pays down a card without changing net worth', () => {
    const before = buildAccountsView([bpi, visa], [])
    const after = buildAccountsView(
      [bpi, visa],
      [txn({ id: 't', type: 'transfer', amount: 5_000_00, accountId: 'bpi', toAccountId: 'visa' })],
    )

    expect(after.spending[0]?.balance).toBe(5_000_00)
    expect(after.cards[0]?.balance).toBe(-15_480_00)
    // Paying a card moves money; it does not create or destroy any.
    expect(after.netWorth.total).toBe(before.netWorth.total)
  })

  it('frees up the headroom it paid off', () => {
    const after = buildAccountsView(
      [bpi, visa],
      [txn({ id: 't', type: 'transfer', amount: 5_000_00, accountId: 'bpi', toAccountId: 'visa' })],
    )
    expect(after.cards[0]?.available).toBe(44_520_00)
  })

  it('leaves a pending transfer out until it posts', () => {
    const after = buildAccountsView(
      [bpi, visa],
      [
        txn({
          id: 't',
          type: 'transfer',
          amount: 5_000_00,
          accountId: 'bpi',
          toAccountId: 'visa',
          status: 'pending',
        }),
      ],
    )
    expect(after.spending[0]?.balance).toBe(10_000_00)
  })
})

describe('canArchive', () => {
  it('allows an emptied account', () => {
    expect(canArchive({ account: account({ id: 'a' }), balance: 0 })).toBe(true)
  })

  it('holds back one that still holds money', () => {
    expect(canArchive({ account: account({ id: 'a' }), balance: 100 })).toBe(false)
  })
})

describe('empty state', () => {
  it('reports zeroes rather than failing', () => {
    const empty = buildAccountsView([], [])
    expect(empty.netWorth.total).toBe(0)
    expect(empty.spending).toEqual([])
    expect(empty.cards).toEqual([])
  })
})

describe('TYPE_LABEL', () => {
  it('names every account type', () => {
    expect(TYPE_LABEL).toEqual({
      cash: 'Wallet',
      bank: 'Bank',
      ewallet: 'E-wallet',
      credit: 'Credit card',
    })
  })
})
