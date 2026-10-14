/**
 * The recurring scheduler. Dates only — posting a due rule is the caller's
 * job; working out when it next falls is this module's.
 */

import { addDays, addMonths, addWeeks, addYears, parseISO } from 'date-fns'
import type { DateOnly, Id, Recurring, TransactionStatus } from '@/db/types'
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

/**
 * How many occurrences of one rule a single run will catch up on. A phone
 * left in a drawer for a year should not wake up and post 365 daily rows in
 * one go; what is left over is simply picked up on the next open.
 */
export const MAX_CATCHUP = 60

export interface PlannedOccurrence {
  ruleId: Id
  date: DateOnly
  /** Auto rules post straight away; confirm rules wait for a yes. */
  status: TransactionStatus
}

export interface SchedulePlan {
  occurrences: PlannedOccurrence[]
  /** Where each touched rule's `nextDate` ends up. */
  nextDates: Array<{ ruleId: Id; nextDate: DateOnly }>
  /** Rules that hit the catch-up cap and still have occurrences waiting. */
  capped: Id[]
}

const fallsDue = (date: DateOnly, endDate: DateOnly | undefined, today: DateOnly): boolean =>
  date <= today && (endDate === undefined || date <= endDate)

/**
 * Everything that should have happened by `today`, worked out without
 * touching the database.
 *
 * Each rule is walked forward from its `nextDate`, so an app that has not
 * been opened for three months catches up on all three occurrences rather
 * than only the latest. The scheduler owns `nextDate`: an occurrence is
 * materialised and the rule moves on in the same breath, which is what makes
 * running this twice harmless.
 */
export function planSchedule(
  rules: readonly Recurring[],
  today: DateOnly,
  limit: number = MAX_CATCHUP,
): SchedulePlan {
  const occurrences: PlannedOccurrence[] = []
  const nextDates: SchedulePlan['nextDates'] = []
  const capped: Id[] = []

  for (const rule of rules) {
    let cursor = rule.nextDate
    let made = 0

    while (fallsDue(cursor, rule.endDate, today) && made < limit) {
      occurrences.push({
        ruleId: rule.id,
        date: cursor,
        status: rule.mode === 'auto' ? 'posted' : 'pending',
      })
      cursor = advanceDate(cursor, rule.freq, rule.interval)
      made += 1
    }

    if (made === 0) continue
    nextDates.push({ ruleId: rule.id, nextDate: cursor })
    if (fallsDue(cursor, rule.endDate, today)) capped.push(rule.id)
  }

  occurrences.sort((a, b) => a.date.localeCompare(b.date))
  return { occurrences, nextDates, capped }
}
