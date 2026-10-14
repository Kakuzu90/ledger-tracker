import { describe, expect, it } from 'vitest'
import { buildSampleData } from '@/db/sample'
import type { Category, Transaction } from '@/db/types'
import {
  buildReports,
  buildYearInReview,
  customRange,
  periodRange,
  within,
} from './reports'

const TODAY = new Date(2026, 9, 14)
const sample = buildSampleData({ today: TODAY })
const input = { transactions: sample.transactions, categories: sample.categories }
const month = buildReports(input, 'month', TODAY)

const stamps = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }

let seq = 0
const txn = (date: string, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: `t${seq++}`,
  type: 'expense',
  amount,
  accountId: 'a',
  date,
  note: '',
  tags: [],
  status: 'posted',
  ...stamps,
  ...over,
})

const category = (id: string, name: string, parentId?: string): Category => ({
  id,
  name,
  kind: 'expense',
  color: '#1D4E89',
  order: 1,
  archived: false,
  ...(parentId ? { parentId } : {}),
  ...stamps,
})

describe('periodRange', () => {
  it('runs a week from Monday to Sunday', () => {
    expect(periodRange('week', TODAY)).toMatchObject({
      start: '2026-10-12',
      end: '2026-10-18',
      label: '12–18 Oct',
    })
  })

  it('spans the month ends', () => {
    expect(periodRange('month', TODAY)).toMatchObject({
      start: '2026-10-01',
      end: '2026-10-31',
      label: 'Oct 2026',
    })
  })

  it('spans the whole year', () => {
    expect(periodRange('year', TODAY)).toMatchObject({
      start: '2026-01-01',
      end: '2026-12-31',
      label: '2026',
    })
  })

  it('steps back by whole periods', () => {
    expect(periodRange('month', TODAY, 1).label).toBe('Sep 2026')
    expect(periodRange('week', TODAY, 1).start).toBe('2026-10-05')
    expect(periodRange('year', TODAY, 2).label).toBe('2024')
  })

  it('names a week that straddles two months on both sides', () => {
    expect(periodRange('week', new Date(2026, 9, 1)).label).toBe('28 Sep – 4 Oct')
  })
})

describe('customRange', () => {
  it('keeps the dates it is given', () => {
    expect(customRange('2026-08-01', '2026-10-14')).toMatchObject({
      start: '2026-08-01',
      end: '2026-10-14',
    })
  })

  it('swaps a range entered backwards rather than showing nothing', () => {
    expect(customRange('2026-10-14', '2026-08-01').start).toBe('2026-08-01')
  })
})

describe('within', () => {
  const range = periodRange('month', TODAY)

  it.each([
    ['2026-10-01', true],
    ['2026-10-31', true],
    ['2026-09-30', false],
    ['2026-11-01', false],
  ])('puts %s inside October: %s', (date, expected) => {
    expect(within(txn(date, 100), range)).toBe(expected)
  })
})

describe('buildReports, against the sample ledger', () => {
  it('reports the ₱31,480 spent and ₱52,000 in for October', () => {
    expect(month.spent).toBe(31_480_00)
    expect(month.income).toBe(52_000_00)
  })

  it('rolls subcategory spend up into its parent', () => {
    // Groceries and Dining out both sit under Food.
    const food = month.slices.find((slice) => slice.name === 'Food')
    expect(food?.amount).toBe(8_940_00)
  })

  it('shows the five biggest and gathers the rest into Other', () => {
    expect(month.slices).toHaveLength(6)
    expect(month.slices.at(-1)?.name).toBe('Other')
    expect(month.slices.map((slice) => slice.name).slice(0, 2)).toEqual(['Bills', 'Food'])
  })

  it('adds the slices back up to what was spent', () => {
    const total = month.slices.reduce((sum, slice) => sum + slice.amount, 0)
    expect(total).toBe(month.spent)
  })

  it('shares out to one whole', () => {
    const shares = month.slices.reduce((sum, slice) => sum + slice.share, 0)
    expect(shares).toBeCloseTo(1, 6)
  })

  it('compares each slice with the month before', () => {
    expect(month.previous.label).toBe('Sep 2026')
    for (const slice of month.slices) {
      expect(slice.delta).toMatch(/^(\+|−)?\d+%$|^new$/)
    }
  })

  it('builds six periods of trend, ending on the one shown', () => {
    expect(month.trend).toHaveLength(6)
    expect(month.trend.map((point) => point.label)).toEqual([
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
    ])
    expect(month.trend.at(-1)?.current).toBe(true)
    expect(month.trend.at(-1)?.expense).toBe(31_480_00)
  })

  it('averages what was saved across the trend, as the mockup prints it', () => {
    expect(month.averageSaved).toBe(17_387_00)
    expect(month.periodsCounted).toBe(6)
  })
})

describe('other periods', () => {
  it('narrows to the week on screen', () => {
    const week = buildReports(input, 'week', TODAY)
    expect(week.range.label).toBe('12–18 Oct')
    expect(week.spent).toBeLessThan(month.spent)
    // Weeks are labelled by their start day, naming the month only where
    // it turns, so the axis does not read "Sep Sep Sep Sep Oct Oct".
    expect(week.trend.map((point) => point.label)).toEqual([
      '7 Sep',
      '14',
      '21',
      '28',
      '5 Oct',
      '12',
    ])
  })

  it('widens to the whole year', () => {
    const year = buildReports(input, 'year', TODAY)
    expect(year.range.label).toBe('2026')
    expect(year.spent).toBeGreaterThan(month.spent)
    expect(year.trend.map((point) => point.label)).toEqual([
      '2021',
      '2022',
      '2023',
      '2024',
      '2025',
      '2026',
    ])
  })

  it('leaves the years before the ledger out of the average', () => {
    const year = buildReports(input, 'year', TODAY)
    // Only 2026 has anything in it; dividing by six would understate it.
    expect(year.periodsCounted).toBe(1)
    expect(year.averageSaved).toBe(year.trend.at(-1)?.saved)
  })

  it('honours a custom range and compares it with a month', () => {
    const custom = buildReports(
      input,
      'custom',
      TODAY,
      customRange('2026-10-01', '2026-10-07'),
    )
    expect(custom.range.start).toBe('2026-10-01')
    expect(custom.spent).toBeLessThan(month.spent)
    expect(custom.previous.label).toBe('Sep 2026')
  })
})

describe('edges', () => {
  const categories = [category('food', 'Food'), category('groceries', 'Groceries', 'food')]

  it('reports zeroes for a period with nothing in it', () => {
    const empty = buildReports({ transactions: [], categories }, 'month', TODAY)
    expect(empty.spent).toBe(0)
    expect(empty.slices).toEqual([])
    expect(empty.averageSaved).toBe(0)
    expect(empty.periodsCounted).toBe(0)
  })

  it('does not divide by zero when nothing was spent', () => {
    const empty = buildReports({ transactions: [], categories }, 'month', TODAY)
    expect(empty.spentDelta).toBe('0%')
  })

  it('calls a category that is new this period "new"', () => {
    const fresh = buildReports(
      { transactions: [txn('2026-10-02', 500_00, { categoryId: 'food' })], categories },
      'month',
      TODAY,
    )
    expect(fresh.slices[0]?.delta).toBe('new')
  })

  it('reads spending less than last month as the good direction', () => {
    const falling = buildReports(
      {
        transactions: [
          txn('2026-09-02', 1_000_00, { categoryId: 'food' }),
          txn('2026-10-02', 500_00, { categoryId: 'food' }),
        ],
        categories,
      },
      'month',
      TODAY,
    )
    expect(falling.slices[0]?.delta).toBe('−50%')
    expect(falling.slices[0]?.improving).toBe(true)
  })

  it('leaves transfers and loan movements out of both sides', () => {
    const mixed = buildReports(
      {
        transactions: [
          txn('2026-10-02', 5_000_00, { type: 'transfer' }),
          txn('2026-10-03', 2_000_00, { loanId: 'l' }),
          txn('2026-10-04', 900_00, { type: 'income', loanId: 'l' }),
          txn('2026-10-05', 300_00, { categoryId: 'food' }),
        ],
        categories,
      },
      'month',
      TODAY,
    )
    expect(mixed.spent).toBe(300_00)
    expect(mixed.income).toBe(0)
  })

  it('collects uncategorised spend under its own slice', () => {
    const loose = buildReports(
      { transactions: [txn('2026-10-02', 700_00)], categories },
      'month',
      TODAY,
    )
    expect(loose.slices[0]?.name).toBe('Uncategorised')
  })
})

describe('buildYearInReview', () => {
  const review = buildYearInReview(
    { ...input, accounts: sample.accounts, loans: sample.loans },
    2026,
    TODAY,
  )

  it('totals the year', () => {
    expect(review.spent).toBeGreaterThan(0)
    expect(review.saved).toBe(review.income - review.spent)
  })

  it('names the five biggest categories', () => {
    expect(review.top).toHaveLength(5)
    expect(review.top[0]?.amount).toBeGreaterThanOrEqual(review.top[1]?.amount ?? 0)
  })

  it('lists the five largest single expenses, biggest first', () => {
    expect(review.biggest).toHaveLength(5)
    const amounts = review.biggest.map((row) => row.amount)
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts)
    expect(review.biggest[0]?.account).toBeDefined()
  })

  it('counts the loans settled that year', () => {
    expect(review.loansSettled).toBe(1)
  })

  it('names the leanest month, ignoring the one still in progress', () => {
    // October is half over; it must not win on being incomplete.
    expect(review.leanestMonth).toBeTypeOf('string')
    expect(review.leanestMonth).not.toBe('October')
  })

  it('says nothing confidently about a year with no data', () => {
    const quiet = buildYearInReview(
      { transactions: [], categories: [], accounts: [], loans: [] },
      2019,
      TODAY,
    )
    expect(quiet).toMatchObject({ spent: 0, income: 0, saved: 0, loansSettled: 0 })
    expect(quiet.biggest).toEqual([])
    expect(quiet.leanestMonth).toBeUndefined()
  })
})
