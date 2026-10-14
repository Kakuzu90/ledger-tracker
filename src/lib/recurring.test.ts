import { describe, expect, it } from 'vitest'
import {
  advanceDate,
  advanceRule,
  dueRules,
  hasEnded,
  isDue,
  planSchedule,
  upcomingDates,
} from './recurring'
import type { Recurring } from '@/db/types'

const stamps = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }

const rule = (over: Partial<Recurring> & Pick<Recurring, 'id'>): Recurring => ({
  template: { type: 'expense', amount: 149_00, accountId: 'gcash', note: 'Spotify', tags: [] },
  freq: 'monthly',
  interval: 1,
  startDate: '2026-04-14',
  nextDate: '2026-10-14',
  mode: 'confirm',
  ...stamps,
  ...over,
})

describe('advanceDate', () => {
  it.each([
    ['daily' as const, 1, '2026-10-15'],
    ['daily' as const, 10, '2026-10-24'],
    ['weekly' as const, 1, '2026-10-21'],
    ['weekly' as const, 2, '2026-10-28'],
    ['monthly' as const, 1, '2026-11-14'],
    ['monthly' as const, 3, '2027-01-14'],
    ['yearly' as const, 1, '2027-10-14'],
  ])('steps %s by %i', (freq, interval, expected) => {
    expect(advanceDate('2026-10-14', freq, interval)).toBe(expected)
  })

  it('clamps a month-end date into a shorter month', () => {
    // Rent on the 31st still falls due in November, on the 30th.
    expect(advanceDate('2026-10-31', 'monthly', 1)).toBe('2026-11-30')
  })

  it('crosses a year boundary', () => {
    expect(advanceDate('2026-12-20', 'monthly', 1)).toBe('2027-01-20')
  })

  it('treats a zero interval as one, rather than never advancing', () => {
    expect(advanceDate('2026-10-14', 'monthly', 0)).toBe('2026-11-14')
  })

  it('handles a leap day', () => {
    expect(advanceDate('2028-02-29', 'yearly', 1)).toBe('2029-02-28')
  })
})

describe('isDue', () => {
  it('is due on the day', () => {
    expect(isDue(rule({ id: 'a' }), '2026-10-14')).toBe(true)
  })

  it('stays due once overdue', () => {
    expect(isDue(rule({ id: 'a', nextDate: '2026-10-01' }), '2026-10-14')).toBe(true)
  })

  it('is not due yet when it falls later', () => {
    expect(isDue(rule({ id: 'a', nextDate: '2026-10-20' }), '2026-10-14')).toBe(false)
  })

  it('is never due past its end date', () => {
    expect(isDue(rule({ id: 'a', endDate: '2026-09-30' }), '2026-10-14')).toBe(false)
  })
})

describe('dueRules', () => {
  it('returns what is waiting, soonest first', () => {
    const rules = [
      rule({ id: 'later', nextDate: '2026-10-20' }),
      rule({ id: 'today', nextDate: '2026-10-14' }),
      rule({ id: 'overdue', nextDate: '2026-10-02' }),
    ]

    expect(dueRules(rules, '2026-10-14').map((r) => r.id)).toEqual(['overdue', 'today'])
  })
})

describe('advanceRule', () => {
  it('moves the rule on by one period', () => {
    expect(advanceRule(rule({ id: 'a' }))).toEqual({ nextDate: '2026-11-14' })
  })

  it('respects a weekly interval', () => {
    const weekly = rule({ id: 'a', freq: 'weekly', interval: 2 })
    expect(advanceRule(weekly)).toEqual({ nextDate: '2026-10-28' })
  })
})

describe('hasEnded', () => {
  it('is finished once the next date passes the end', () => {
    expect(hasEnded(rule({ id: 'a', nextDate: '2026-11-14', endDate: '2026-10-31' }))).toBe(true)
  })

  it('runs forever without an end date', () => {
    expect(hasEnded(rule({ id: 'a' }))).toBe(false)
  })
})

describe('upcomingDates', () => {
  it('lists the next few occurrences', () => {
    expect(upcomingDates(rule({ id: 'a' }), 3)).toEqual([
      '2026-10-14',
      '2026-11-14',
      '2026-12-14',
    ])
  })

  it('stops at the end date', () => {
    expect(upcomingDates(rule({ id: 'a', endDate: '2026-11-30' }), 5)).toEqual([
      '2026-10-14',
      '2026-11-14',
    ])
  })
})

describe('planSchedule', () => {
  it('finds nothing when no rule has come due', () => {
    const plan = planSchedule([rule({ id: 'a', nextDate: '2026-10-20' })], '2026-10-14')
    expect(plan.occurrences).toEqual([])
    expect(plan.nextDates).toEqual([])
  })

  it('posts an auto rule and waits on a confirm one', () => {
    const plan = planSchedule(
      [
        rule({ id: 'auto', mode: 'auto', nextDate: '2026-10-14' }),
        rule({ id: 'ask', mode: 'confirm', nextDate: '2026-10-14' }),
      ],
      '2026-10-14',
    )

    expect(plan.occurrences).toEqual([
      { ruleId: 'auto', date: '2026-10-14', status: 'posted' },
      { ruleId: 'ask', date: '2026-10-14', status: 'pending' },
    ])
  })

  it('moves every rule it touched on, which is what stops a second run', () => {
    const rules = [rule({ id: 'a', mode: 'auto', nextDate: '2026-10-14' })]
    const plan = planSchedule(rules, '2026-10-14')

    expect(plan.nextDates).toEqual([{ ruleId: 'a', nextDate: '2026-11-14' }])
    expect(
      planSchedule([rule({ id: 'a', mode: 'auto', nextDate: '2026-11-14' })], '2026-10-14')
        .occurrences,
    ).toEqual([])
  })

  it('catches up on every occurrence missed while the app was shut', () => {
    // Three months away from a monthly rule.
    const plan = planSchedule([rule({ id: 'a', mode: 'auto', nextDate: '2026-07-14' })], '2026-10-14')

    expect(plan.occurrences.map((o) => o.date)).toEqual([
      '2026-07-14',
      '2026-08-14',
      '2026-09-14',
      '2026-10-14',
    ])
    expect(plan.nextDates[0]?.nextDate).toBe('2026-11-14')
  })

  it('stops a rule at its end date', () => {
    const plan = planSchedule(
      [rule({ id: 'a', mode: 'auto', nextDate: '2026-08-14', endDate: '2026-09-30' })],
      '2026-10-14',
    )
    expect(plan.occurrences.map((o) => o.date)).toEqual(['2026-08-14', '2026-09-14'])
  })

  it('leaves an already-finished rule alone', () => {
    const plan = planSchedule(
      [rule({ id: 'a', nextDate: '2026-10-14', endDate: '2026-09-01' })],
      '2026-10-14',
    )
    expect(plan.occurrences).toEqual([])
  })

  it('caps a long catch-up and says there is more to come', () => {
    // A daily rule, a year unopened.
    const plan = planSchedule(
      [rule({ id: 'a', freq: 'daily', mode: 'auto', nextDate: '2025-10-14' })],
      '2026-10-14',
      5,
    )

    expect(plan.occurrences).toHaveLength(5)
    expect(plan.capped).toEqual(['a'])
    // What is left is simply picked up by the next run.
    expect(plan.nextDates[0]?.nextDate).toBe('2025-10-19')
  })

  it('does not flag a rule that finished its catch-up', () => {
    const plan = planSchedule([rule({ id: 'a', mode: 'auto', nextDate: '2026-10-14' })], '2026-10-14', 5)
    expect(plan.capped).toEqual([])
  })

  it('orders everything by date, oldest first', () => {
    const plan = planSchedule(
      [
        rule({ id: 'b', mode: 'auto', nextDate: '2026-10-12' }),
        rule({ id: 'a', mode: 'auto', nextDate: '2026-10-10' }),
      ],
      '2026-10-14',
    )
    expect(plan.occurrences.map((o) => o.date)).toEqual(['2026-10-10', '2026-10-12'])
  })

  it('honours each rule’s own cadence', () => {
    const plan = planSchedule(
      [rule({ id: 'a', freq: 'weekly', interval: 2, mode: 'auto', nextDate: '2026-09-16' })],
      '2026-10-14',
    )
    expect(plan.occurrences.map((o) => o.date)).toEqual([
      '2026-09-16',
      '2026-09-30',
      '2026-10-14',
    ])
  })
})
