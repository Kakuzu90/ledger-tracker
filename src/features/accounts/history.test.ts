import { describe, expect, it } from 'vitest'
import { accountBalance } from '@/lib/balances'
import type { Account, Transaction } from '@/db/types'
import { buildAccountHistory, touchesAccount, transferCounterpart } from './history'

const stamps = (n: number) => ({
  createdAt: `2026-10-01T00:00:${String(n).padStart(2, '0')}.000Z`,
  updatedAt: '2026-10-01T00:00:00.000Z',
})

const wallet: Account = {
  id: 'cash',
  name: 'Cash',
  type: 'cash',
  currency: 'PHP',
  openingBalance: 1_000_00,
  color: '#000',
  archived: false,
  ...stamps(0),
}

let n = 0
const txn = (over: Partial<Transaction> = {}): Transaction => ({
  id: `t${++n}`,
  type: 'expense',
  amount: 100_00,
  accountId: 'cash',
  date: '2026-10-05',
  note: '',
  tags: [],
  status: 'posted',
  ...stamps(n),
  ...over,
})

describe('touchesAccount', () => {
  it('catches both ends of a transfer', () => {
    const out = txn({ type: 'transfer', accountId: 'cash', toAccountId: 'bank' })
    expect(touchesAccount(out, 'cash')).toBe(true)
    expect(touchesAccount(out, 'bank')).toBe(true)
    expect(touchesAccount(out, 'gcash')).toBe(false)
  })
})

describe('buildAccountHistory', () => {
  it('leaves an untouched account empty, at its opening balance', () => {
    const view = buildAccountHistory(wallet, [txn({ accountId: 'bank' })])
    expect(view.days).toEqual([])
    expect(view.count).toBe(0)
    expect(view.balance).toBe(1_000_00)
  })

  it('signs each row by what it did to this account', () => {
    const view = buildAccountHistory(wallet, [
      txn({ type: 'income', amount: 500_00, date: '2026-10-01' }),
      txn({ type: 'expense', amount: 200_00, date: '2026-10-02' }),
      txn({ type: 'transfer', amount: 300_00, accountId: 'cash', toAccountId: 'bank', date: '2026-10-03' }),
      txn({ type: 'transfer', amount: 50_00, accountId: 'bank', toAccountId: 'cash', date: '2026-10-04' }),
    ])

    // Newest day first.
    expect(view.days.map((day) => day.net)).toEqual([50_00, -300_00, -200_00, 500_00])
  })

  it('runs the balance forward from the opening figure', () => {
    const view = buildAccountHistory(wallet, [
      txn({ type: 'income', amount: 500_00, date: '2026-10-01' }),
      txn({ type: 'expense', amount: 200_00, date: '2026-10-02' }),
    ])

    const [newest, oldest] = view.days
    expect(oldest?.balance).toBe(1_500_00)
    expect(newest?.balance).toBe(1_300_00)
    expect(view.balance).toBe(1_300_00)
  })

  it('agrees with accountBalance, which is the figure shown everywhere else', () => {
    const rows = [
      txn({ type: 'income', amount: 500_00 }),
      txn({ type: 'expense', amount: 75_50 }),
      txn({ type: 'transfer', amount: 300_00, accountId: 'cash', toAccountId: 'bank' }),
    ]
    const view = buildAccountHistory(wallet, rows)
    expect(view.days[0]?.rows[0]?.balance).toBe(accountBalance(wallet, rows))
  })

  it('leaves the running balance alone for a pending row', () => {
    const view = buildAccountHistory(wallet, [
      txn({ type: 'expense', amount: 200_00, date: '2026-10-02', status: 'pending' }),
    ])

    expect(view.count).toBe(1)
    expect(view.days[0]?.rows[0]?.delta).toBe(0)
    expect(view.balance).toBe(1_000_00)
  })

  it('puts the newest row first inside a day, and keeps entry order under it', () => {
    const first = txn({ type: 'expense', amount: 10_00, date: '2026-10-05' })
    const second = txn({ type: 'expense', amount: 20_00, date: '2026-10-05' })
    const view = buildAccountHistory(wallet, [second, first])

    expect(view.days[0]?.rows.map((row) => row.transaction.id)).toEqual([second.id, first.id])
    // Still walked oldest-first underneath, so the balances step down.
    expect(view.days[0]?.rows.map((row) => row.balance)).toEqual([970_00, 990_00])
  })

  it('counts rows, not days', () => {
    const view = buildAccountHistory(wallet, [
      txn({ date: '2026-10-05' }),
      txn({ date: '2026-10-05' }),
      txn({ date: '2026-10-06' }),
    ])
    expect(view.days).toHaveLength(2)
    expect(view.count).toBe(3)
  })
})

describe('transferCounterpart', () => {
  const out = txn({ type: 'transfer', accountId: 'cash', toAccountId: 'bank' })

  it('names where the money went, and where it came from', () => {
    expect(transferCounterpart(out, 'cash')).toEqual({ id: 'bank', direction: 'out' })
    expect(transferCounterpart(out, 'bank')).toEqual({ id: 'cash', direction: 'in' })
  })

  it('has nothing to say about an ordinary expense', () => {
    expect(transferCounterpart(txn(), 'cash')).toBeUndefined()
  })
})
