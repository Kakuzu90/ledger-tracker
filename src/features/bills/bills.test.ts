import { describe, expect, it } from 'vitest'
import { buildSampleData } from '@/db/sample'
import type { Account, Category, Recurring, Transaction } from '@/db/types'
import {
  buildBillsView,
  cadence,
  dueSoon,
  estimateFrom,
  isSubscription,
  monthlyCost,
} from './bills'

const TODAY = new Date(2026, 9, 14)
const sample = buildSampleData({ today: TODAY })
const view = buildBillsView(
  {
    rules: sample.recurring,
    accounts: sample.accounts,
    categories: sample.categories,
    transactions: sample.transactions,
  },
  TODAY,
)

const row = (title: string) =>
  [...view.thisWeek, ...view.later].find((entry) => entry.title === title)

const stamps = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }

/** `amount` and `tags` are a shortcut into the template. */
const rule = (
  over: Partial<Recurring> & Pick<Recurring, 'id'> & { amount?: number; tags?: string[] },
): Recurring => {
  const { amount = 149_00, tags = [], ...rest } = over
  return {
    template: { type: 'expense', amount, accountId: 'gcash', note: 'Spotify', tags },
    freq: 'monthly',
    interval: 1,
    startDate: '2026-04-14',
    nextDate: '2026-10-20',
    mode: 'confirm',
    ...stamps,
    ...rest,
  }
}

const txn = (over: Partial<Transaction> & Pick<Transaction, 'id'>): Transaction => ({
  type: 'expense',
  amount: 149_00,
  accountId: 'gcash',
  date: '2026-09-14',
  note: 'Spotify',
  tags: [],
  status: 'posted',
  ...stamps,
  ...over,
})

const accounts: Account[] = [
  {
    id: 'gcash',
    name: 'GCash',
    type: 'ewallet',
    currency: 'PHP',
    openingBalance: 0,
    color: '#2C6E8A',
    archived: false,
    ...stamps,
  },
]
const categories: Category[] = []

const build = (rules: Recurring[], transactions: Transaction[] = []) =>
  buildBillsView({ rules, accounts, categories, transactions }, TODAY)

describe('cadence', () => {
  it.each([
    ['monthly' as const, 1, 'Monthly'],
    ['weekly' as const, 1, 'Weekly'],
    ['monthly' as const, 3, 'Every 3 months'],
    ['daily' as const, 10, 'Every 10 days'],
    ['yearly' as const, 1, 'Yearly'],
  ])('reads %s every %i as %s', (freq, interval, expected) => {
    expect(cadence(freq, interval)).toBe(expected)
  })
})

describe('monthlyCost', () => {
  it('leaves a monthly rule as it is', () => {
    expect(monthlyCost(rule({ id: 'a' }))).toBe(149_00)
  })

  it('spreads a yearly rule over twelve months', () => {
    expect(monthlyCost(rule({ id: 'a', freq: 'yearly' }))).toBe(1242)
  })

  it('scales a weekly rule up', () => {
    expect(monthlyCost(rule({ id: 'a', freq: 'weekly' }))).toBe(64567)
  })

  it('halves a rule that runs every two months', () => {
    expect(monthlyCost(rule({ id: 'a', interval: 2 }))).toBe(74_50)
  })
})

describe('estimateFrom', () => {
  it('takes the template at its word with no history', () => {
    expect(estimateFrom(rule({ id: 'a' }), [])).toEqual({ amount: 149_00, estimated: false })
  })

  it('still trusts it when every entry matched', () => {
    const history = [txn({ id: 't', recurringId: 'a', amount: 149_00 })]
    expect(estimateFrom(rule({ id: 'a' }), history).estimated).toBe(false)
  })

  it('flags a bill that lands somewhere different each time', () => {
    const history = [
      txn({ id: 't1', recurringId: 'a', amount: 3_410_00, date: '2026-10-12' }),
      txn({ id: 't2', recurringId: 'a', amount: 3_180_00, date: '2026-09-12' }),
      txn({ id: 't3', recurringId: 'a', amount: 3_620_00, date: '2026-08-12' }),
    ]
    const estimate = estimateFrom(rule({ id: 'a', amount: 3_400_00 }), history)

    expect(estimate.estimated).toBe(true)
    expect(estimate.last).toBe(3_410_00)
  })

  it('rounds the guess to the nearest hundred, so it does not read as a quote', () => {
    const history = [txn({ id: 't1', recurringId: 'a', amount: 3_410_00 })]
    expect(estimateFrom(rule({ id: 'a' }), history).amount).toBe(3_400_00)
  })

  it('ignores a pending entry — nothing has actually been paid', () => {
    const history = [txn({ id: 't', recurringId: 'a', amount: 999_00, status: 'pending' })]
    expect(estimateFrom(rule({ id: 'a' }), history).estimated).toBe(false)
  })

  it('ignores another rule’s entries', () => {
    const history = [txn({ id: 't', recurringId: 'other', amount: 999_00 })]
    expect(estimateFrom(rule({ id: 'a' }), history).estimated).toBe(false)
  })
})

describe('buildBillsView, against the sample ledger', () => {
  it('bills ₱34,597 over seven payments in the next 30 days, as in the mockup', () => {
    expect(view.next30).toEqual({ total: 34_597_00, count: 7 })
  })

  it('adds the subscriptions up to ₱1,247 a month and ₱14,964 a year', () => {
    expect(view.subscriptions).toEqual({
      monthly: 1_247_00,
      yearly: 14_964_00,
      count: 4,
    })
  })

  it('leads the week with the three the mockup shows', () => {
    expect(view.thisWeek.map((entry) => [entry.title, entry.day])).toEqual([
      ['Spotify', '14'],
      ['Rent', '15'],
      ['Internet', '18'],
    ])
  })

  it('says which decide for themselves', () => {
    expect(row('Rent')?.mode).toBe('auto')
    expect(row('Internet')?.mode).toBe('confirm')
  })

  it('shows the entry already waiting on a yes rather than the rule behind it', () => {
    const spotify = row('Spotify')
    expect(spotify?.pending).toBeDefined()
    expect(spotify?.subtitle).toBe('Today · GCash')
    expect(spotify?.due).toBe(true)
  })

  it('marks a bill whose amount moves as a guess', () => {
    const electricity = row('Electricity')
    expect(electricity?.estimated).toBe(true)
    expect(electricity?.amount).toBe(3_400_00)
    expect(electricity?.lastAmount).toBe(3_410_00)
    expect(electricity?.subtitle).toBe('Varies')
  })

  it('calls a subscription a subscription', () => {
    expect(row('Netflix')?.subtitle).toBe('Subscription · BPI Visa')
    expect(row('Rent')?.subtitle).toBe('Monthly · BPI Savings')
  })

  it('lists every rule for the manage section, soonest first', () => {
    expect(view.rules).toHaveLength(9)
    expect(view.rules[0]?.title).toBe('Rent')
    expect(view.rules[0]?.subtitle).toBe('Monthly · next Oct 15 · BPI Savings')
  })
})

describe('the forecast', () => {
  it('repeats a weekly rule across the horizon', () => {
    const weekly = build([
      rule({ id: 'a', freq: 'weekly', nextDate: '2026-10-16', amount: 500_00 }),
    ])
    // 16, 23, 30 Oct and 6, 13 Nov — five falls inside 35 days.
    expect(weekly.thisWeek.length + weekly.later.length).toBe(5)
  })

  it('counts only what lands inside thirty days', () => {
    const weekly = build([rule({ id: 'a', freq: 'weekly', nextDate: '2026-10-16' })])
    // 16, 23, 30 Oct and 6, 13 Nov; the 20th of November is past the window.
    expect(weekly.next30.count).toBe(5)
  })

  it('stops at a rule’s end date', () => {
    const ending = build([
      rule({ id: 'a', freq: 'weekly', nextDate: '2026-10-16', endDate: '2026-10-25' }),
    ])
    expect(ending.thisWeek.length + ending.later.length).toBe(2)
  })

  it('drops a rule that has already finished', () => {
    const done = build([rule({ id: 'a', nextDate: '2026-11-01', endDate: '2026-10-01' })])
    expect(done.thisWeek).toEqual([])
    expect(done.later).toEqual([])
    expect(done.rules[0]?.ended).toBe(true)
    expect(done.rules[0]?.subtitle).toContain('ended')
  })

  it('splits the list at the end of the calendar week', () => {
    // Today is Wednesday 14 October 2026, so this week runs to Sunday 18th.
    const split = build([
      rule({ id: 'soon', nextDate: '2026-10-18' }),
      rule({ id: 'later', nextDate: '2026-10-19' }),
    ])
    expect(split.thisWeek.map((entry) => entry.date)).toEqual(['2026-10-18'])
    // Both rules come round again inside the 35-day horizon.
    expect(split.later.map((entry) => entry.date)).toEqual([
      '2026-10-19',
      '2026-11-18',
    ])
  })

  it('keeps an overdue entry in this week rather than hiding it', () => {
    const late = build([], [txn({ id: 't', status: 'pending', date: '2026-10-01' })])
    expect(late.thisWeek[0]?.due).toBe(true)
    expect(late.thisWeek[0]?.subtitle).toBe('One-off · GCash')
  })
})

describe('isSubscription', () => {
  it('reads the tag the rule form sets', () => {
    expect(isSubscription(rule({ id: 'a' }))).toBe(false)
    expect(isSubscription(rule({ id: 'a', tags: ['subscription'] }))).toBe(true)
  })
})

describe('dueSoon', () => {
  it('picks up what falls today or tomorrow', () => {
    expect(dueSoon(view, 1, TODAY).map((entry) => entry.title)).toEqual(['Spotify', 'Rent'])
  })

  it('reaches no further than it is asked to', () => {
    expect(dueSoon(view, 0, TODAY).map((entry) => entry.title)).toEqual(['Spotify'])
  })
})

describe('an empty ledger', () => {
  it('reports zeroes rather than failing', () => {
    const empty = buildBillsView(
      { rules: [], accounts: [], categories: [], transactions: [] },
      TODAY,
    )
    expect(empty.next30).toEqual({ total: 0, count: 0 })
    expect(empty.subscriptions).toEqual({ monthly: 0, yearly: 0, count: 0 })
    expect(empty.rules).toEqual([])
  })
})
