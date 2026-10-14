import { describe, expect, it } from 'vitest'
import { advanceDate, advanceRule, dueRules, hasEnded, isDue, upcomingDates } from './recurring'
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
