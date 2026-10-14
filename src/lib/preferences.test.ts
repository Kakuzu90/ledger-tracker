import { describe, expect, it } from 'vitest'
import type { Setting } from '@/db/types'
import {
  DEFAULT_PREFERENCES,
  readPreferences,
  reminderLabel,
  REMINDER_INTERVALS,
} from './preferences'

const rows = (values: Record<string, unknown>): Setting[] =>
  Object.entries(values).map(([key, value]) => ({ key, value }))

describe('readPreferences', () => {
  it('gives the defaults for an empty table', () => {
    expect(readPreferences([])).toEqual(DEFAULT_PREFERENCES)
  })

  it('reads what the user set', () => {
    expect(
      readPreferences(
        rows({ name: 'Alex', currency: 'USD', theme: 'dark', budgetAlerts: true }),
      ),
    ).toMatchObject({ name: 'Alex', currency: 'USD', theme: 'dark', budgetAlerts: true })
  })

  it('falls back when a value is the wrong type', () => {
    // A restored file, or a hand-edited row.
    const read = readPreferences(rows({ billReminders: 'yes', backupReminderDays: 'soon' }))
    expect(read.billReminders).toBe(false)
    expect(read.backupReminderDays).toBe(30)
  })

  it('refuses a theme it does not know', () => {
    expect(readPreferences(rows({ theme: 'sepia' })).theme).toBe('system')
  })

  it('refuses a negative reminder interval', () => {
    expect(readPreferences(rows({ backupReminderDays: -7 })).backupReminderDays).toBe(30)
  })

  it('takes zero days as the reminder being off', () => {
    expect(readPreferences(rows({ backupReminderDays: 0 })).backupReminderDays).toBe(0)
  })

  it('ignores rows that are nothing to do with preferences', () => {
    expect(readPreferences(rows({ lastBackupAt: '2026-09-10T00:00:00.000Z' }))).toEqual(
      DEFAULT_PREFERENCES,
    )
  })
})

describe('reminderLabel', () => {
  it('names the intervals offered', () => {
    expect(reminderLabel(30)).toBe('Every 30 days')
    expect(reminderLabel(0)).toBe('Never')
  })

  it('still reads an interval from an older version', () => {
    expect(reminderLabel(45)).toBe('Every 45 days')
  })

  it('offers a way to turn the nudge off', () => {
    expect(REMINDER_INTERVALS.some((interval) => interval.days === 0)).toBe(true)
  })
})
