/**
 * Everything the settings screen can change, in one shape.
 *
 * The `settings` table is a key/value store, so a row can hold anything —
 * including something a restored backup or an older version of the app put
 * there. Reading goes through `readPreferences`, which falls back to the
 * default for any value that is not the type it should be, so one bad row
 * cannot take a screen down.
 */

import type { Setting } from '@/db/types'
import type { ThemePref } from './theme'
import { DEFAULT_CURRENCY } from './money'

export interface Preferences {
  /** Shown in the home greeting. Empty until the user says who they are. */
  name: string
  currency: string
  theme: ThemePref
  /** Start each launch with amounts masked. */
  hideAmountsOnOpen: boolean
  billReminders: boolean
  loanReminders: boolean
  budgetAlerts: boolean
  /** Days between backup nudges; 0 turns the nudge off. */
  backupReminderDays: number
  /** Ask for a password and encrypt whatever is exported. */
  encryptBackups: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  name: '',
  currency: DEFAULT_CURRENCY,
  theme: 'system',
  hideAmountsOnOpen: false,
  billReminders: false,
  loanReminders: false,
  budgetAlerts: false,
  backupReminderDays: 30,
  encryptBackups: false,
}

export type PreferenceKey = keyof Preferences

const THEMES: readonly ThemePref[] = ['light', 'dark', 'system']

/** The intervals the backup reminder offers. */
export const REMINDER_INTERVALS: ReadonlyArray<{ days: number; label: string }> = [
  { days: 7, label: 'Every week' },
  { days: 14, label: 'Every 2 weeks' },
  { days: 30, label: 'Every 30 days' },
  { days: 90, label: 'Every 3 months' },
  { days: 0, label: 'Never' },
]

export const reminderLabel = (days: number): string =>
  REMINDER_INTERVALS.find((interval) => interval.days === days)?.label ??
  `Every ${days} days`

export function readPreferences(rows: readonly Setting[]): Preferences {
  const byKey = new Map(rows.map((row) => [row.key, row.value]))
  const read = <T>(key: string, guard: (value: unknown) => value is T, fallback: T): T => {
    const value = byKey.get(key)
    return guard(value) ? value : fallback
  }

  const isString = (value: unknown): value is string => typeof value === 'string'
  const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
  const isTheme = (value: unknown): value is ThemePref =>
    isString(value) && (THEMES as readonly string[]).includes(value)
  const isDays = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0

  return {
    name: read('name', isString, DEFAULT_PREFERENCES.name),
    currency: read('currency', isString, DEFAULT_PREFERENCES.currency),
    theme: read('theme', isTheme, DEFAULT_PREFERENCES.theme),
    hideAmountsOnOpen: read(
      'hideAmountsOnOpen',
      isBoolean,
      DEFAULT_PREFERENCES.hideAmountsOnOpen,
    ),
    billReminders: read('billReminders', isBoolean, DEFAULT_PREFERENCES.billReminders),
    loanReminders: read('loanReminders', isBoolean, DEFAULT_PREFERENCES.loanReminders),
    budgetAlerts: read('budgetAlerts', isBoolean, DEFAULT_PREFERENCES.budgetAlerts),
    backupReminderDays: Math.round(
      read('backupReminderDays', isDays, DEFAULT_PREFERENCES.backupReminderDays),
    ),
    encryptBackups: read('encryptBackups', isBoolean, DEFAULT_PREFERENCES.encryptBackups),
  }
}
