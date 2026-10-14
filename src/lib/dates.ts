/**
 * Date helpers for the screens. Dates are stored as `YYYY-MM-DD` strings;
 * these turn them into the labels the mockups show.
 */

import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { DateOnly, MonthKey } from '@/db/types'

export const toDateOnly = (date: Date): DateOnly => format(date, 'yyyy-MM-dd')
export const monthKey = (date: Date): MonthKey => format(date, 'yyyy-MM')

/**
 * `"Today"`, `"Yesterday"`, `"Tomorrow"`, a weekday inside the coming week,
 * or `"Oct 12"` beyond that — matching the activity and bills lists.
 */
export function relativeDay(date: DateOnly, today: Date = new Date()): string {
  const days = differenceInCalendarDays(parseISO(date), today)

  if (days === 0) return 'Today'
  if (days === -1) return 'Yesterday'
  if (days === 1) return 'Tomorrow'
  if (days > 1 && days < 7) return format(parseISO(date), 'EEE')
  return format(parseISO(date), 'MMM d')
}

/** Longer form for day headers: `"Tue, Oct 13"`. */
export function dayHeading(date: DateOnly, today: Date = new Date()): string {
  const days = differenceInCalendarDays(parseISO(date), today)
  if (days === 0) return 'Today'
  if (days === -1) return 'Yesterday'
  return format(parseISO(date), 'EEE, MMM d')
}

/** Days left in the month, counting today. */
export function daysLeftInMonth(today: Date = new Date()): number {
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  return lastDay - today.getDate() + 1
}

/** Whole days since a timestamp, for the backup reminder. */
export function daysSince(iso: string, today: Date = new Date()): number {
  return Math.max(0, differenceInCalendarDays(today, parseISO(iso)))
}
