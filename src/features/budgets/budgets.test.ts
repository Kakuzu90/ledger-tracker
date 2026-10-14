import { describe, expect, it } from 'vitest'
import { buildSampleData } from '@/db/sample'
import type { Goal } from '@/db/types'
import {
  alertingLines,
  buildBudgetsView,
  childIdsByParent,
  daysLeftIn,
  monthName,
  recentMonths,
} from './budgets'

const TODAY = new Date(2026, 9, 14)
const sample = buildSampleData({ today: TODAY })

const build = (month = '2026-10', today = TODAY) =>
  buildBudgetsView(
    {
      month,
      budgets: sample.budgets,
      categories: sample.categories,
      transactions: sample.transactions,
      goals: sample.goals,
    },
    today,
  )

const view = build()
const line = (name: string) => view.categories.find((row) => row.name === name)

const stamps = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g',
  name: 'Japan trip',
  target: 80_000_00,
  saved: 42_000_00,
  ...stamps,
  ...over,
})

const goalsView = (goals: Goal[], today = TODAY) =>
  buildBudgetsView(
    { month: '2026-10', budgets: [], categories: [], transactions: [], goals },
    today,
  ).goals

describe('childIdsByParent', () => {
  it('maps each parent to its children', () => {
    const map = childIdsByParent(sample.categories)
    const food = sample.categories.find((c) => c.name === 'Food')
    const groceries = sample.categories.find((c) => c.name === 'Groceries')
    expect(map.get(food?.id ?? '')).toContain(groceries?.id)
  })

  it('leaves a category with no children out', () => {
    expect(childIdsByParent([]).size).toBe(0)
  })
})

describe('daysLeftIn', () => {
  it('counts today as one of them', () => {
    expect(daysLeftIn('2026-10', TODAY)).toBe(18)
  })

  it('has none left in a month already gone', () => {
    expect(daysLeftIn('2026-09', TODAY)).toBe(0)
  })

  it('has the whole of a month still to come', () => {
    expect(daysLeftIn('2026-11', TODAY)).toBe(30)
  })

  it('has one left on the last day', () => {
    expect(daysLeftIn('2026-10', new Date(2026, 9, 31))).toBe(1)
  })
})

describe('buildBudgetsView, against the sample ledger', () => {
  it('names the month', () => {
    expect(view.monthLabel).toBe('October 2026')
  })

  it('reports the ₱31,480 of ₱40,000 from the mockup', () => {
    expect(view.overall).toMatchObject({
      limit: 40_000_00,
      spent: 31_480_00,
      remaining: 8_520_00,
    })
    expect(Math.round((view.overall?.share ?? 0) * 100)).toBe(79)
  })

  it('counts the days still to come', () => {
    expect(view.daysLeft).toBe(18)
  })

  it('projects the month at the rate so far', () => {
    // ₱31,480 through 14 of 31 days.
    expect(view.onPace).toBe(69_706_00)
  })

  it('lists the budgeted categories, biggest spend first', () => {
    expect(view.categories.map((row) => row.name)).toEqual([
      'Bills',
      'Food',
      'Shopping',
      'Transport',
      'Health',
    ])
  })

  it('flags the category that went over', () => {
    expect(line('Bills')).toMatchObject({
      spent: 9_200_00,
      effective: 9_000_00,
      remaining: -200_00,
      status: 'over',
    })
  })

  it('flags the one that is close', () => {
    expect(line('Food')).toMatchObject({ spent: 8_940_00, status: 'near' })
    expect(Math.round((line('Food')?.share ?? 0) * 100)).toBe(89)
  })

  it('leaves the comfortable ones alone', () => {
    expect(line('Shopping')?.status).toBe('under')
    expect(line('Transport')?.status).toBe('under')
  })

  it('counts a child category against its parent', () => {
    // Food's ₱8,940 includes the Groceries and Dining out entries.
    expect(line('Food')?.spent).toBe(8_940_00)
  })

  it('totals what fell outside every budget', () => {
    expect(view.unbudgeted).toBe(6_600_00)
  })

  it('carries nothing into a first month of rollover', () => {
    // Health rolls over, but there is no September budget behind it.
    expect(line('Health')).toMatchObject({ rollover: true, carry: 0 })
    expect(line('Health')?.carryNote).toBeUndefined()
  })
})

describe('rollover on the view', () => {
  it('adds the carry into the limit and says where it came from', () => {
    const rolled = buildBudgetsView(
      {
        month: '2026-10',
        budgets: [
          { id: 'a', month: '2026-09', categoryId: 'health', limit: 2_000_00, rollover: true, ...stamps },
          { id: 'b', month: '2026-10', categoryId: 'health', limit: 2_000_00, rollover: true, ...stamps },
        ],
        categories: [
          { id: 'health', name: 'Health', kind: 'expense', color: '#0F6E64', order: 1, archived: false, ...stamps },
        ],
        transactions: [
          {
            id: 't1',
            type: 'expense',
            amount: 1_600_00,
            accountId: 'a',
            categoryId: 'health',
            date: '2026-09-10',
            note: '',
            tags: [],
            status: 'posted',
            ...stamps,
          },
        ],
        goals: [],
      },
      TODAY,
    )

    expect(rolled.categories[0]).toMatchObject({
      limit: 2_000_00,
      carry: 400_00,
      effective: 2_400_00,
      carryNote: 'from Sep',
    })
  })
})

describe('an empty month', () => {
  const empty = build('2026-11')

  it('has no overall budget to show', () => {
    expect(empty.overall).toBeNull()
    expect(empty.categories).toEqual([])
    expect(empty.onPace).toBeNull()
  })

  it('still lists the goals', () => {
    expect(empty.goals).toHaveLength(2)
  })

  it('leads with the goal that has a deadline', () => {
    expect(empty.goals.map((card) => card.goal.name)).toEqual([
      'Japan trip',
      'Emergency fund',
    ])
  })
})

describe('savings goals', () => {
  it('works out the share saved', () => {
    const [card] = goalsView([goal()])
    expect(card?.share).toBeCloseTo(0.525, 3)
    expect(card?.remaining).toBe(38_000_00)
  })

  it('works out what it takes a month to hit a deadline', () => {
    const [card] = goalsView([goal({ deadline: '2026-03-01' })])
    // Already past, so there is no monthly figure to give.
    expect(card?.note).toBe('Deadline passed')

    const [ahead] = goalsView([goal({ deadline: '2027-03-01' })])
    // ₱38,000 over five months, rounded up to whole pesos.
    expect(ahead?.perMonth).toBe(7_600_00)
    expect(ahead?.note).toBe('to reach by Mar 2027')
  })

  it('rounds the monthly figure up, so it actually gets there', () => {
    const [card] = goalsView([
      goal({ target: 10_000_00, saved: 0, deadline: '2026-12-14' }),
    ])
    // ₱10,000 over two months is ₱5,000; a rounding down would fall short.
    expect((card?.perMonth ?? 0) * 2).toBeGreaterThanOrEqual(10_000_00)
  })

  it('says so plainly when there is no deadline', () => {
    const [card] = goalsView([goal({ deadline: undefined })])
    expect(card?.note).toBe('No deadline')
    expect(card?.perMonth).toBeUndefined()
  })

  it('reads a finished goal as reached, not as 110%', () => {
    const [card] = goalsView([goal({ saved: 90_000_00 })])
    expect(card).toMatchObject({ reached: true, share: 1, remaining: 0, note: 'Reached' })
  })
})

describe('recentMonths', () => {
  it('starts at this month and walks back', () => {
    const months = recentMonths(TODAY, 3)
    expect(months).toEqual(['2026-10', '2026-09', '2026-08'])
  })

  it('crosses the year boundary', () => {
    expect(recentMonths(new Date(2026, 1, 5), 3)).toEqual(['2026-02', '2026-01', '2025-12'])
  })
})

describe('monthName', () => {
  it('spells a month key out', () => {
    expect(monthName('2026-10')).toBe('October 2026')
  })
})

describe('alertingLines', () => {
  it('picks out the category over its limit and the one close to it', () => {
    expect(alertingLines(view)).toEqual({
      overallOver: false,
      over: ['Bills'],
      near: ['Food'],
    })
  })

  it('has nothing to say about a month with no budgets', () => {
    expect(alertingLines(build('2026-11'))).toEqual({
      overallOver: false,
      over: [],
      near: [],
    })
  })

  it('notices a month that is over even when no single category is', () => {
    const over = buildBudgetsView(
      {
        month: '2026-10',
        budgets: [
          { id: 'o', month: '2026-10', categoryId: null, limit: 1_000_00, rollover: false, ...stamps },
        ],
        categories: [],
        transactions: [
          {
            id: 't1',
            type: 'expense',
            amount: 1_500_00,
            accountId: 'a',
            date: '2026-10-02',
            note: '',
            tags: [],
            status: 'posted',
            ...stamps,
          },
        ],
        goals: [],
      },
      TODAY,
    )

    expect(alertingLines(over)).toMatchObject({ overallOver: true, over: [], near: [] })
  })
})
