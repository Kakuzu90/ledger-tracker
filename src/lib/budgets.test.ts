import { describe, expect, it } from 'vitest'
import type { Budget, Id, Transaction } from '@/db/types'
import {
  budgetLine,
  buildBudgets,
  carryInto,
  onPaceFor,
  previousMonth,
  spentIn,
  statusOf,
  type BudgetInput,
} from './budgets'

const stamps = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }

let seq = 0
const budget = (
  month: string,
  categoryId: Id | null,
  limit: number,
  rollover = false,
): Budget => ({ id: `b${seq++}`, month, categoryId, limit, rollover, ...stamps })

const txn = (date: string, amount: number, categoryId?: Id): Transaction => ({
  id: `t${seq++}`,
  type: 'expense',
  amount,
  accountId: 'a',
  date,
  note: '',
  tags: [],
  status: 'posted',
  ...(categoryId ? { categoryId } : {}),
  ...stamps,
})

const input = (over: Partial<BudgetInput> = {}): BudgetInput => ({
  budgets: [],
  transactions: [],
  childIdsByParent: new Map(),
  ...over,
})

describe('previousMonth', () => {
  it.each([
    ['2026-10', '2026-09'],
    ['2026-01', '2025-12'],
    ['2026-03', '2026-02'],
  ])('steps %s back to %s', (month, expected) => {
    expect(previousMonth(month)).toBe(expected)
  })
})

describe('spentIn', () => {
  const base = input({
    transactions: [
      txn('2026-10-02', 1_000_00, 'food'),
      txn('2026-10-20', 500_00, 'groceries'),
      txn('2026-09-15', 900_00, 'food'),
      txn('2026-10-05', 300_00),
    ],
    childIdsByParent: new Map([['food', ['groceries']]]),
  })

  it('adds a parent and its children together', () => {
    // The budget is set on Food; the entries land on Groceries too.
    expect(spentIn('food', '2026-10', base)).toBe(1_500_00)
  })

  it('keeps months apart', () => {
    expect(spentIn('food', '2026-09', base)).toBe(900_00)
  })

  it('counts everything, uncategorised included, for the whole month', () => {
    expect(spentIn(null, '2026-10', base)).toBe(1_800_00)
  })

  it('leaves a transfer and a loan movement out', () => {
    const mixed = input({
      transactions: [
        { ...txn('2026-10-02', 1_000_00, 'food') },
        { ...txn('2026-10-03', 5_000_00, 'food'), type: 'transfer' },
        { ...txn('2026-10-04', 2_000_00, 'food'), loanId: 'l' },
        { ...txn('2026-10-05', 700_00, 'food'), status: 'pending' },
      ],
    })
    expect(spentIn('food', '2026-10', mixed)).toBe(1_000_00)
  })
})

describe('carryInto', () => {
  it('brings forward what last month left over', () => {
    const base = input({
      budgets: [budget('2026-09', 'health', 2_000_00, true), budget('2026-10', 'health', 2_000_00, true)],
      transactions: [txn('2026-09-10', 1_600_00, 'health')],
    })
    expect(carryInto('health', '2026-10', base)).toBe(400_00)
  })

  it('brings nothing forward when the rule is off this month', () => {
    const base = input({
      budgets: [budget('2026-09', 'health', 2_000_00), budget('2026-10', 'health', 2_000_00)],
      transactions: [txn('2026-09-10', 1_600_00, 'health')],
    })
    expect(carryInto('health', '2026-10', base)).toBe(0)
  })

  it('carries nothing, not a debt, out of an overspent month', () => {
    const base = input({
      budgets: [budget('2026-09', 'health', 2_000_00, true), budget('2026-10', 'health', 2_000_00, true)],
      transactions: [txn('2026-09-10', 3_000_00, 'health')],
    })
    expect(carryInto('health', '2026-10', base)).toBe(0)
  })

  it('chains back through several untouched months', () => {
    const base = input({
      budgets: [
        budget('2026-08', 'health', 1_000_00, true),
        budget('2026-09', 'health', 1_000_00, true),
        budget('2026-10', 'health', 1_000_00, true),
      ],
    })
    // Nothing spent in August or September: both months' limits carry.
    expect(carryInto('health', '2026-10', base)).toBe(2_000_00)
  })

  it('stops where the chain of budgets stops', () => {
    const base = input({
      budgets: [budget('2026-10', 'health', 1_000_00, true)],
    })
    expect(carryInto('health', '2026-10', base)).toBe(0)
  })

  it('gives up rather than recursing forever', () => {
    const budgets = Array.from({ length: 40 }, (_, i) => {
      const month = `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
      return budget(month, 'health', 100_00, true)
    })
    expect(carryInto('health', '2026-10', input({ budgets }))).toBeLessThanOrEqual(12 * 100_00)
  })
})

describe('statusOf', () => {
  it.each([
    [500_00, 1_000_00, 'under'],
    [850_00, 1_000_00, 'near'],
    [1_000_00, 1_000_00, 'near'],
    [1_001_00, 1_000_00, 'over'],
    [0, 0, 'under'],
  ])('reads %i of %i as %s', (spent, limit, expected) => {
    expect(statusOf(spent, limit)).toBe(expected)
  })
})

describe('budgetLine', () => {
  it('resolves a plain budget', () => {
    const line = budgetLine(
      'bills',
      '2026-10',
      input({
        budgets: [budget('2026-10', 'bills', 9_000_00)],
        transactions: [txn('2026-10-12', 9_200_00, 'bills')],
      }),
    )

    expect(line).toMatchObject({
      limit: 9_000_00,
      carry: 0,
      effective: 9_000_00,
      spent: 9_200_00,
      remaining: -200_00,
      status: 'over',
    })
  })

  it('adds the carry into what is available', () => {
    const line = budgetLine(
      'health',
      '2026-10',
      input({
        budgets: [
          budget('2026-09', 'health', 2_000_00, true),
          budget('2026-10', 'health', 2_000_00, true),
        ],
        transactions: [txn('2026-09-10', 1_600_00, 'health'), txn('2026-10-03', 600_00, 'health')],
      }),
    )

    // The mockup's "₱600 of ₱2,400 (₱2,000 + ₱400 from Sep)".
    expect(line).toMatchObject({ carry: 400_00, effective: 2_400_00, spent: 600_00 })
    expect(Math.round((line?.share ?? 0) * 100)).toBe(25)
  })

  it('is null when the category has no budget', () => {
    expect(budgetLine('food', '2026-10', input())).toBeNull()
  })

  it('does not divide by a zero limit', () => {
    const line = budgetLine(
      'food',
      '2026-10',
      input({ budgets: [budget('2026-10', 'food', 0)] }),
    )
    expect(line?.share).toBe(0)
    expect(line?.status).toBe('under')
  })
})

describe('buildBudgets', () => {
  const base = input({
    budgets: [
      budget('2026-10', null, 40_000_00),
      budget('2026-10', 'bills', 9_000_00),
      budget('2026-10', 'food', 10_000_00),
    ],
    transactions: [
      txn('2026-10-02', 9_200_00, 'bills'),
      txn('2026-10-03', 8_000_00, 'food'),
      txn('2026-10-04', 940_00, 'groceries'),
      txn('2026-10-05', 3_960_00, 'shopping'),
      txn('2026-10-06', 1_200_00),
    ],
    childIdsByParent: new Map([['food', ['groceries']]]),
  })

  const built = buildBudgets('2026-10', base)

  it('resolves the whole-month budget against everything spent', () => {
    expect(built.overall).toMatchObject({ limit: 40_000_00, spent: 23_300_00 })
  })

  it('lists the category budgets, biggest spend first', () => {
    expect(built.byCategory.map((line) => line.categoryId)).toEqual(['bills', 'food'])
  })

  it('counts a child against its parent budget', () => {
    expect(built.byCategory[1]?.spent).toBe(8_940_00)
  })

  it('totals what fell outside every budget', () => {
    // Shopping 3,960 plus the uncategorised 1,200.
    expect(built.unbudgeted).toBe(5_160_00)
  })

  it('does not count a budgeted parent’s children as unbudgeted', () => {
    expect(built.unbudgeted).not.toContain(940_00)
  })

  it('copes with a month that has no budgets at all', () => {
    const bare = buildBudgets('2026-11', base)
    expect(bare.overall).toBeNull()
    expect(bare.byCategory).toEqual([])
    expect(bare.unbudgeted).toBe(0)
  })
})

describe('onPaceFor', () => {
  it('extends the run rate to the end of the month', () => {
    // ₱14,000 by the 14th of a 31-day month.
    expect(onPaceFor(14_000_00, 14, 31)).toBe(31_000_00)
  })

  it('is exactly the spend on the last day', () => {
    expect(onPaceFor(31_480_00, 31, 31)).toBe(31_480_00)
  })

  it('drops the centavos — it is an estimate, not a figure', () => {
    // 31,480 / 14 × 31 is 69,705.71.
    expect(onPaceFor(31_480_00, 14, 31)).toBe(69_706_00)
  })

  it('does not divide by zero on the day before the month starts', () => {
    expect(onPaceFor(1_000_00, 0, 31)).toBe(0)
  })
})
