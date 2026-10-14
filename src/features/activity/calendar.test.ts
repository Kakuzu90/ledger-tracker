import { describe, expect, it } from 'vitest'
import { buildMonthGrid, defaultSelectedDay, shiftMonth } from './calendar'
import type { Recurring, Transaction } from '@/db/types'

const stamps = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }
const TODAY = new Date(2026, 9, 14)

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

const rule = (nextDate: string): Recurring => ({
  id: `rule-${nextDate}`,
  template: { type: 'expense', amount: 149_00, accountId: 'gcash', note: 'Spotify', tags: [] },
  freq: 'monthly',
  interval: 1,
  startDate: '2026-01-01',
  nextDate,
  mode: 'confirm',
  ...stamps,
})

const rows = [
  txn({ id: 'a', date: '2026-10-01', amount: 200_00 }),
  txn({ id: 'b', date: '2026-10-05', amount: 1_000_00 }),
  txn({ id: 'c', date: '2026-10-05', amount: 500_00 }),
  txn({ id: 'd', date: '2026-10-13', amount: 2_145_00 }),
  txn({ id: 'e', date: '2026-10-13', type: 'income', amount: 26_000_00 }),
  txn({ id: 'f', date: '2026-10-12', type: 'transfer', amount: 2_000_00, toAccountId: 'bpi' }),
  txn({ id: 'g', date: '2026-10-14', amount: 149_00, status: 'pending' }),
  txn({ id: 'h', date: '2026-09-30', amount: 900_00 }),
  txn({ id: 'lent', date: '2026-10-08', amount: 3_500_00, loanId: 'loan-1' }),
]

const grid = buildMonthGrid('2026-10', rows, [rule('2026-10-15')], TODAY)

describe('buildMonthGrid', () => {
  it('has one cell per day of the month', () => {
    expect(grid.cells).toHaveLength(31)
    expect(grid.cells[0]?.day).toBe(1)
    expect(grid.cells.at(-1)?.day).toBe(31)
  })

  it('starts the grid on the right weekday, Monday first', () => {
    // 1 October 2026 is a Thursday, so three blanks precede it.
    expect(grid.leading).toBe(3)
  })

  it('adds up spending per day', () => {
    expect(grid.cells.find((c) => c.day === 5)?.spent).toBe(1_500_00)
    expect(grid.cells.find((c) => c.day === 13)?.spent).toBe(2_145_00)
  })

  it('keeps income separate from spending', () => {
    const thirteenth = grid.cells.find((c) => c.day === 13)
    expect(thirteenth?.income).toBe(26_000_00)
    expect(thirteenth?.spent).toBe(2_145_00)
  })

  it('counts neither transfers nor pending entries as spending', () => {
    expect(grid.cells.find((c) => c.day === 12)?.spent).toBe(0)
    expect(grid.cells.find((c) => c.day === 14)?.spent).toBe(0)
  })

  it('does not shade a day for money lent out', () => {
    // Otherwise the calendar claims a bigger month than the home screen does.
    expect(grid.cells.find((c) => c.day === 8)?.spent).toBe(0)
    expect(grid.totalSpent).toBe(3_845_00)
  })

  it('ignores other months', () => {
    expect(grid.totalSpent).toBe(3_845_00)
    expect(grid.totalIncome).toBe(26_000_00)
  })

  it('shades quiet days lighter than busy ones', () => {
    const first = grid.cells.find((c) => c.day === 1)
    const thirteenth = grid.cells.find((c) => c.day === 13)

    expect(first?.level).toBeGreaterThan(0)
    expect(thirteenth?.level).toBe(4)
    expect(thirteenth!.level).toBeGreaterThan(first!.level)
  })

  it('leaves a day with no spending unshaded', () => {
    expect(grid.cells.find((c) => c.day === 2)?.level).toBe(0)
  })

  it('marks the day a bill falls due', () => {
    expect(grid.cells.find((c) => c.day === 15)?.hasBill).toBe(true)
    expect(grid.cells.find((c) => c.day === 16)?.hasBill).toBe(false)
  })

  it('marks today and the days still to come', () => {
    expect(grid.cells.find((c) => c.day === 14)?.isToday).toBe(true)
    expect(grid.cells.find((c) => c.day === 13)?.isFuture).toBe(false)
    expect(grid.cells.find((c) => c.day === 20)?.isFuture).toBe(true)
  })

  it('handles a month with nothing in it', () => {
    const empty = buildMonthGrid('2026-01', [], [], TODAY)
    expect(empty.totalSpent).toBe(0)
    expect(empty.cells.every((cell) => cell.level === 0)).toBe(true)
  })

  it('gets February right in a leap year', () => {
    expect(buildMonthGrid('2028-02', [], [], TODAY).cells).toHaveLength(29)
  })
})

describe('shiftMonth', () => {
  it('steps back and forward', () => {
    expect(shiftMonth('2026-10', -1)).toBe('2026-09')
    expect(shiftMonth('2026-10', 1)).toBe('2026-11')
  })

  it('crosses a year boundary', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })
})

describe('defaultSelectedDay', () => {
  it('picks today when the month is the current one', () => {
    expect(defaultSelectedDay(grid, TODAY)).toBe('2026-10-14')
  })

  it('picks the busiest day in any other month', () => {
    const september = buildMonthGrid('2026-09', rows, [], TODAY)
    expect(defaultSelectedDay(september, TODAY)).toBe('2026-09-30')
  })

  it('picks nothing in an empty month', () => {
    expect(defaultSelectedDay(buildMonthGrid('2026-01', [], [], TODAY), TODAY)).toBeNull()
  })
})
