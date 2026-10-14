import { describe, expect, it } from 'vitest'
import { dayHeading, daysLeftInMonth, daysSince, monthKey, relativeDay, toDateOnly } from './dates'

const TODAY = new Date(2026, 9, 14) // Wednesday, 14 October 2026

describe('toDateOnly / monthKey', () => {
  it('formats without drifting across time zones', () => {
    expect(toDateOnly(TODAY)).toBe('2026-10-14')
    expect(monthKey(TODAY)).toBe('2026-10')
  })
})

describe('relativeDay', () => {
  it.each([
    ['2026-10-14', 'Today'],
    ['2026-10-13', 'Yesterday'],
    ['2026-10-15', 'Tomorrow'],
    ['2026-10-18', 'Sun'],
    ['2026-10-25', 'Oct 25'],
    ['2026-10-02', 'Oct 2'],
  ])('labels %s as %s', (date, expected) => {
    expect(relativeDay(date, TODAY)).toBe(expected)
  })
})

describe('dayHeading', () => {
  it('spells out past days', () => {
    expect(dayHeading('2026-10-12', TODAY)).toBe('Mon, Oct 12')
  })

  it('still says Today and Yesterday', () => {
    expect(dayHeading('2026-10-14', TODAY)).toBe('Today')
    expect(dayHeading('2026-10-13', TODAY)).toBe('Yesterday')
  })
})

describe('daysLeftInMonth', () => {
  it('counts today as one of them', () => {
    expect(daysLeftInMonth(TODAY)).toBe(18)
  })

  it('is one on the last day', () => {
    expect(daysLeftInMonth(new Date(2026, 9, 31))).toBe(1)
  })

  it('handles February in a leap year', () => {
    expect(daysLeftInMonth(new Date(2028, 1, 1))).toBe(29)
  })
})

describe('daysSince', () => {
  it('counts whole days back', () => {
    expect(daysSince('2026-09-10T08:00:00.000Z', TODAY)).toBe(34)
  })

  it('never goes negative for a future stamp', () => {
    expect(daysSince('2026-11-01T00:00:00.000Z', TODAY)).toBe(0)
  })
})
