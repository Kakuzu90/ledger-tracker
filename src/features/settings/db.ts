/**
 * Reads and writes behind the settings screen, plus the two things that have
 * to happen for a preference to mean anything: applying the stored ones at
 * launch, and running the reminders the user switched on.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { setSetting } from '@/db/settings'
import type { Timestamp } from '@/db/types'
import {
  readPreferences,
  type PreferenceKey,
  type Preferences,
} from '@/lib/preferences'
import { setActiveCurrency } from '@/lib/money'
import { applyTheme } from '@/lib/theme'
import { notificationState, type NotificationState } from '@/lib/notifications'
import { useUIStore } from '@/store/ui'
import { remindAboutBills } from '@/features/bills/db'
import { remindAboutLoans } from '@/features/loans/db'
import { alertAboutBudgets } from '@/features/budgets/db'
import type { SettingsCounts } from './settings'

export interface SettingsData {
  preferences: Preferences
  counts: SettingsCounts
  lastBackupAt?: Timestamp
  notifications: NotificationState
}

export function useSettingsData(): SettingsData | undefined {
  return useLiveQuery(async () => {
    const [settings, categories, accounts, rules, contacts, transactions] =
      await Promise.all([
        db.settings.toArray(),
        db.categories.toArray(),
        db.accounts.toArray(),
        db.recurring.count(),
        db.contacts.count(),
        db.transactions.toArray(),
      ])

    const tags = new Set<string>()
    for (const txn of transactions) for (const tag of txn.tags) tags.add(tag)

    const lastBackup = settings.find((row) => row.key === 'lastBackupAt')?.value

    return {
      preferences: readPreferences(settings),
      counts: {
        categories: categories.filter((c) => !c.archived && c.parentId === undefined).length,
        tags: tags.size,
        accounts: accounts.filter((account) => !account.archived).length,
        rules,
        contacts,
      },
      ...(typeof lastBackup === 'string' ? { lastBackupAt: lastBackup } : {}),
      notifications: notificationState(),
    }
  }, [])
}

/**
 * Stores one preference and makes it true. Theme and currency change what is
 * already on screen, so they are applied here rather than left for the next
 * launch to pick up.
 */
export async function savePreference<K extends PreferenceKey>(
  key: K,
  value: Preferences[K],
): Promise<void> {
  await setSetting(key, value)

  if (key === 'theme') applyTheme(value as Preferences['theme'])
  if (key === 'currency') {
    setActiveCurrency(value as string)
    useUIStore.getState().setCurrency(value as string)
  }
}

/**
 * Applies the stored preferences at launch. The theme is handled separately
 * and earlier (it has a localStorage mirror, so the first paint is right);
 * this is everything else.
 */
export async function applyStartupPreferences(): Promise<Preferences> {
  const preferences = readPreferences(await db.settings.toArray())

  setActiveCurrency(preferences.currency)
  const ui = useUIStore.getState()
  ui.setCurrency(preferences.currency)
  if (preferences.hideAmountsOnOpen) ui.setAmountsHidden(true)

  return preferences
}

export interface ReminderResult {
  bills: boolean
  loans: boolean
  budgets: boolean
}

/**
 * The reminders, on open — the only moment an app with no push server gets.
 * Each one checks its own switch and its own once-a-day mark, so this is
 * safe to call on every launch and on a double effect in dev.
 */
export async function runReminders(today: Date = new Date()): Promise<ReminderResult> {
  return {
    bills: await remindAboutBills(today),
    loans: await remindAboutLoans(today),
    budgets: await alertAboutBudgets(today),
  }
}
