/**
 * The settings screen as data (design/Settings.dc.html).
 *
 * The counts beside each "Organize" row and the age of the last backup are
 * the only things on that screen that are not a stored preference, so this
 * is where they are worked out.
 */

import type { Timestamp } from '@/db/types'
import { daysSince } from '@/lib/dates'
import { currencyLabel } from '@/lib/money'
import { reminderLabel, type Preferences } from '@/lib/preferences'
import type { NotificationState } from '@/lib/notifications'

/** Substituted at build time (see vite.config.ts). */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

export interface SettingsCounts {
  /** Top-level expense and income categories, archived ones excluded. */
  categories: number
  /** Distinct tags across every transaction. */
  tags: number
  accounts: number
  rules: number
  contacts: number
}

export interface SettingsView {
  preferences: Preferences
  counts: SettingsCounts
  /** "PHP ₱" */
  currencyLabel: string
  /** "14 · 9" — categories and tags, as the mockup prints it. */
  organiseLabel: string
  /** "34 days ago", "Today", "Never". */
  backupLabel: string
  /** Past the reminder interval, so the row is printed in warning ink. */
  backupOverdue: boolean
  /** "Every 30 days" */
  backupReminderLabel: string
  /** What the browser will actually let the reminders do. */
  notifications: NotificationState
  /** Whether a notice can be raised at all; the rows say so when not. */
  canNotify: boolean
  version: string
}

export interface SettingsInput {
  preferences: Preferences
  counts: SettingsCounts
  lastBackupAt?: Timestamp
  notifications: NotificationState
}

/** "Never", "Today", "Yesterday", "34 days ago". */
export function backupAgeLabel(lastBackupAt: Timestamp | undefined, today: Date): string {
  if (lastBackupAt === undefined) return 'Never'
  const days = daysSince(lastBackupAt, today)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

/**
 * A backup is overdue once it is older than the reminder interval. With the
 * reminder off there is nothing to be late for, but a ledger that has never
 * been backed up is still worth pointing at.
 */
export function backupOverdue(
  lastBackupAt: Timestamp | undefined,
  intervalDays: number,
  today: Date,
): boolean {
  if (lastBackupAt === undefined) return true
  if (intervalDays <= 0) return false
  return daysSince(lastBackupAt, today) >= intervalDays
}

export function buildSettingsView(
  { preferences, counts, lastBackupAt, notifications }: SettingsInput,
  today: Date = new Date(),
  version: string = APP_VERSION,
): SettingsView {
  return {
    preferences,
    counts,
    currencyLabel: currencyLabel(preferences.currency),
    organiseLabel: `${counts.categories} · ${counts.tags}`,
    backupLabel: backupAgeLabel(lastBackupAt, today),
    backupOverdue: backupOverdue(lastBackupAt, preferences.backupReminderDays, today),
    backupReminderLabel: reminderLabel(preferences.backupReminderDays),
    notifications,
    canNotify: notifications === 'granted' || notifications === 'default',
    version,
  }
}
