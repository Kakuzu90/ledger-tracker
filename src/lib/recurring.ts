/**
 * The recurring scheduler. Dates only — posting a due rule is the caller's
 * job; working out when it next falls is this module's.
 */

import { addDays, addMonths, addWeeks, addYears, parseISO } from 'date-fns'
import type { DateOnly, Recurring } from '@/db/types'
import { toDateOnly } from './dates'

/** One step of `freq` × `interval` from `date`. */
export function advanceDate(
  date: DateOnly,
  freq: Recurring['freq'],
  interval: number,
): DateOnly {
  const from = parseISO(date)
  const step = Math.max(1, interval)

  switch (freq) {
    case 'daily':
      return toDateOnly(addDays(from, step))
    case 'weekly':
      return toDateOnly(addWeeks(from, step))
    case 'monthly':
      // date-fns clamps: the 31st becomes the 30th in a short month.
      return toDateOnly(addMonths(from, step))
    case 'yearly':
      return toDateOnly(addYears(from, step))
  }
}

/** True when the rule is due on or before `today` and has not expired. */
export function isDue(rule: Recurring, today: DateOnly): boolean {
  if (rule.endDate !== undefined && rule.nextDate > rule.endDate) return false
  return rule.nextDate <= today
}

/** Rules waiting on the user, soonest first. */
export function dueRules(rules: readonly Recurring[], today: DateOnly): Recurring[] {
  return rules
    .filter((rule) => isDue(rule, today))
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
}

/**
 * The rule after its occurrence is handled. Past the end date the rule is
 * finished, which the caller sees as a nextDate beyond that end.
 */
export function advanceRule(rule: Recurring): Pick<Recurring, 'nextDate'> {
  return { nextDate: advanceDate(rule.nextDate, rule.freq, rule.interval) }
}

/** Has this rule run its course? */
export function hasEnded(rule: Recurring): boolean {
  return rule.endDate !== undefined && rule.nextDate > rule.endDate
}

/** The next `count` dates a rule will fall on, for the bills forecast. */
export function upcomingDates(rule: Recurring, count: number): DateOnly[] {
  const dates: DateOnly[] = []
  let cursor = rule.nextDate

  for (let i = 0; i < count; i++) {
    if (rule.endDate !== undefined && cursor > rule.endDate) break
    dates.push(cursor)
    cursor = advanceDate(cursor, rule.freq, rule.interval)
  }

  return dates
}
