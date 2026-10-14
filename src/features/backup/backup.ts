/**
 * The backup screen as data (design/Backup.dc.html).
 *
 * The honest framing of this screen comes from one fact: the ledger lives in
 * one browser's IndexedDB and nowhere else. So the age of the last backup is
 * a warning, not a statistic, and the restore step says what it will destroy
 * before it does it.
 */

import type { Timestamp } from '@/db/types'
import { formatBytes, type BackupSummary } from '@/lib/backup'
import { reminderLabel } from '@/lib/preferences'
import { backupAgeLabel, backupOverdue } from '@/features/settings/settings'

export interface StorageFacts {
  /** Bytes the origin is using, or null when the browser will not say. */
  usage: number | null
  receipts: number
  /** Whether the browser has promised not to evict the data. */
  persisted: boolean
}

export interface BackupView {
  lastBackupAt?: Timestamp
  /** "34 days ago", "Today", "Never". */
  ageLabel: string
  /** "Last backup 34 days ago" — the heading on the warning card. */
  ageHeadline: string
  overdue: boolean
  encrypt: boolean
  reminderDays: number
  reminderLabel: string
  storage: StorageFacts
  /** "4.2 MB · 38 receipts". */
  storageLabel: string
}

export interface BackupInput {
  lastBackupAt?: Timestamp
  encrypt: boolean
  reminderDays: number
  storage: StorageFacts
}

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : 's'}`

/** "4.2 MB · 38 receipts", or just the receipts when the browser is coy. */
export function storageLabel({ usage, receipts }: StorageFacts): string {
  const parts = [
    ...(usage === null ? [] : [formatBytes(usage)]),
    plural(receipts, 'receipt'),
  ]
  return parts.join(' · ')
}

export function buildBackupView(
  { lastBackupAt, encrypt, reminderDays, storage }: BackupInput,
  today: Date = new Date(),
): BackupView {
  const ageLabel = backupAgeLabel(lastBackupAt, today)

  return {
    ...(lastBackupAt ? { lastBackupAt } : {}),
    ageLabel,
    ageHeadline:
      lastBackupAt === undefined
        ? 'You have never backed this up'
        : `Last backup ${ageLabel.toLowerCase()}`,
    overdue: backupOverdue(lastBackupAt, reminderDays, today),
    encrypt,
    reminderDays,
    reminderLabel: reminderLabel(reminderDays),
    storage,
    storageLabel: storageLabel(storage),
  }
}

/** "1,284 transactions · 9 loans · 5 accounts" under the chosen file. */
export function summaryLine(summary: BackupSummary): string {
  if (summary.rows === 0) return 'Nothing in it'
  return summary.lines
    .map((line) => `${line.count.toLocaleString()} ${line.label}`)
    .join(' · ')
}
