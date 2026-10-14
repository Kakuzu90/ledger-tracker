/**
 * Reads and writes behind Backup & data.
 *
 * Collecting a backup reads every table; restoring one replaces every table.
 * Both go through `src/lib/backup.ts`, which owns the file format — this
 * module is only the part that touches Dexie and the browser.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { clearAll } from '@/db/sample'
import { ensureSeeded } from '@/db/seed'
import { setSetting } from '@/db/settings'
import type { Receipt, Timestamp } from '@/db/types'
import {
  buildEnvelope,
  emptyTables,
  type BackupEnvelope,
  type BackupTables,
  type ReceiptRecord,
} from '@/lib/backup'
import { base64ToBytes, blobToBytes, bytesToBase64 } from '@/lib/bytes'
import { readPreferences } from '@/lib/preferences'
import {
  estimateStorage,
  isStoragePersisted,
  requestPersistentStorage,
} from '@/lib/storage'
import type { StorageFacts } from './backup'

export interface BackupData {
  lastBackupAt?: Timestamp
  encrypt: boolean
  reminderDays: number
  receipts: number
}

export function useBackupData(): BackupData | undefined {
  return useLiveQuery(async () => {
    const [settings, receipts] = await Promise.all([
      db.settings.toArray(),
      db.receipts.count(),
    ])
    const preferences = readPreferences(settings)
    const lastBackup = settings.find((row) => row.key === 'lastBackupAt')?.value

    return {
      ...(typeof lastBackup === 'string' ? { lastBackupAt: lastBackup } : {}),
      encrypt: preferences.encryptBackups,
      reminderDays: preferences.backupReminderDays,
      receipts,
    }
  }, [])
}

/** What the browser will say about the space in use, and whether it is safe. */
export async function readStorageFacts(receipts: number): Promise<StorageFacts> {
  const [estimate, persisted] = await Promise.all([
    estimateStorage(),
    isStoragePersisted(),
  ])

  return { usage: estimate?.usage ?? null, receipts, persisted }
}

/**
 * The Storage row's button. Unlike the once-a-day ask at launch this always
 * asks, because the user just pressed it — and it records a yes so the
 * launch stops asking.
 */
export async function askForPersistentStorage(): Promise<boolean> {
  const granted = await requestPersistentStorage()
  if (granted) await setSetting('storagePersisted', true)
  return granted
}

export interface BackupBundle {
  data: BackupTables
  /**
   * Receipts whose image could not be read back out of storage. The rest of
   * the backup still goes out — a missing photo is worth far less than the
   * ledger — but the screen says so rather than letting it pass unnoticed.
   */
  skippedReceipts: number
}

/** Reads every table into the shape the backup file stores. */
export async function collectBackup(): Promise<BackupBundle> {
  const [
    accounts,
    categories,
    transactions,
    receipts,
    recurring,
    contacts,
    loans,
    loanPayments,
    budgets,
    goals,
    settings,
  ] = await Promise.all([
    db.accounts.toArray(),
    db.categories.toArray(),
    db.transactions.toArray(),
    db.receipts.toArray(),
    db.recurring.toArray(),
    db.contacts.toArray(),
    db.loans.toArray(),
    db.loanPayments.toArray(),
    db.budgets.toArray(),
    db.goals.toArray(),
    db.settings.toArray(),
  ])

  // Receipt blobs are the one thing JSON cannot hold, so they travel as
  // base64.
  const encoded = await Promise.all(receipts.map(encodeReceipt))

  return {
    data: {
      accounts,
      categories,
      transactions,
      receipts: encoded.filter((record): record is ReceiptRecord => record !== null),
      recurring,
      contacts,
      loans,
      loanPayments,
      budgets,
      goals,
      settings,
    },
    skippedReceipts: encoded.filter((record) => record === null).length,
  }
}

async function encodeReceipt(receipt: Receipt): Promise<ReceiptRecord | null> {
  let data: string
  try {
    data = bytesToBase64(await blobToBytes(receipt.blob))
  } catch {
    return null
  }

  return {
    id: receipt.id,
    createdAt: receipt.createdAt,
    updatedAt: receipt.updatedAt,
    mime: receipt.mime,
    size: receipt.size,
    data,
  }
}

function decodeReceipt(record: ReceiptRecord): Receipt {
  const bytes = base64ToBytes(record.data)
  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    mime: record.mime,
    size: record.size,
    blob: new Blob([bytes as BlobPart], { type: record.mime }),
  }
}

export interface BuiltBackup {
  envelope: BackupEnvelope
  skippedReceipts: number
}

export async function buildBackup(now: Date = new Date()): Promise<BuiltBackup> {
  const { data, skippedReceipts } = await collectBackup()
  return { envelope: buildEnvelope(data, now), skippedReceipts }
}

export async function markBackedUp(now: Date = new Date()): Promise<void> {
  await setSetting('lastBackupAt', now.toISOString())
}

/**
 * Replaces everything with what is in the file. Destructive by design, and
 * said so on the screen before it runs: there is no merge that could tell a
 * restored duplicate from a real one.
 */
export async function restoreBackup(envelope: BackupEnvelope): Promise<void> {
  const data = { ...emptyTables(), ...envelope.data }

  await clearAll(db)
  await db.transaction('rw', db.tables, async () => {
    await db.accounts.bulkAdd(data.accounts)
    await db.categories.bulkAdd(data.categories)
    await db.transactions.bulkAdd(data.transactions)
    await db.receipts.bulkAdd(data.receipts.map(decodeReceipt))
    await db.recurring.bulkAdd(data.recurring)
    await db.contacts.bulkAdd(data.contacts)
    await db.loans.bulkAdd(data.loans)
    await db.loanPayments.bulkAdd(data.loanPayments)
    await db.budgets.bulkAdd(data.budgets)
    await db.goals.bulkAdd(data.goals)
    await db.settings.bulkPut(data.settings)
  })

  // A restored file can be missing a preference a later version added.
  await ensureSeeded(db)
}

/** Empties the ledger and puts a fresh install back in its place. */
export async function resetAllData(): Promise<void> {
  await clearAll(db)
  await ensureSeeded(db)
}
