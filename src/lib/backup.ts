/**
 * Backup files: the envelope the app writes, the reader that validates one
 * coming back in, and the password encryption that can wrap it.
 *
 * There is no server, so a backup file is the only copy of the ledger that
 * survives a cleared browser. That makes two things non-negotiable here: the
 * file has to carry everything (receipt blobs included, base64 encoded), and
 * reading one has to be suspicious — a half-understood file must be refused
 * outright rather than restored into a half-empty database.
 */

import { base64ToBytes, bytesToBase64 } from './bytes'
import type {
  Account,
  Budget,
  Category,
  Contact,
  Goal,
  Loan,
  LoanPayment,
  Recurring,
  Setting,
  Timestamp,
  Transaction,
} from '@/db/types'

export const BACKUP_APP = 'ledger'
export const BACKUP_VERSION = 1

/** PBKDF2 work factor. OWASP's 2023 floor for SHA-256. */
export const KDF_ITERATIONS = 210_000

/** A receipt with its blob encoded, since JSON cannot hold binary. */
export interface ReceiptRecord {
  id: string
  createdAt: Timestamp
  updatedAt: Timestamp
  mime: string
  size: number
  /** base64, no data: prefix. */
  data: string
}

export interface BackupTables {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  receipts: ReceiptRecord[]
  recurring: Recurring[]
  contacts: Contact[]
  loans: Loan[]
  loanPayments: LoanPayment[]
  budgets: Budget[]
  goals: Goal[]
  settings: Setting[]
}

export interface BackupEnvelope {
  app: typeof BACKUP_APP
  version: number
  exportedAt: Timestamp
  data: BackupTables
}

export interface EncryptedEnvelope {
  app: typeof BACKUP_APP
  version: number
  exportedAt: Timestamp
  encrypted: true
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  cipher: { name: 'AES-GCM'; iv: string }
  /** base64 ciphertext of the UTF-8 JSON envelope. */
  payload: string
}

/** The tables, in the order the restore preview lists them. */
export const TABLE_LABELS: ReadonlyArray<{ key: keyof BackupTables; label: string }> = [
  { key: 'transactions', label: 'transactions' },
  { key: 'accounts', label: 'accounts' },
  { key: 'categories', label: 'categories' },
  { key: 'loans', label: 'loans' },
  { key: 'loanPayments', label: 'loan payments' },
  { key: 'recurring', label: 'recurring rules' },
  { key: 'contacts', label: 'contacts' },
  { key: 'budgets', label: 'budgets' },
  { key: 'goals', label: 'goals' },
  { key: 'receipts', label: 'receipts' },
  { key: 'settings', label: 'settings' },
]

const EMPTY: BackupTables = {
  accounts: [],
  categories: [],
  transactions: [],
  receipts: [],
  recurring: [],
  contacts: [],
  loans: [],
  loanPayments: [],
  budgets: [],
  goals: [],
  settings: [],
}

export function emptyTables(): BackupTables {
  return structuredClone(EMPTY)
}

export function buildEnvelope(
  data: BackupTables,
  exportedAt: Date = new Date(),
): BackupEnvelope {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    data,
  }
}

/** `ledger-backup-2026-10-14.json` — sorts by date in a downloads folder. */
export function backupFilename(date: Date = new Date(), encrypted = false): string {
  const day = date.toISOString().slice(0, 10)
  return `ledger-backup-${day}${encrypted ? '-encrypted' : ''}.json`
}

// ---- reading -------------------------------------------------------------

export type ParsedBackup =
  | { kind: 'plain'; envelope: BackupEnvelope }
  | { kind: 'encrypted'; envelope: EncryptedEnvelope }
  | { kind: 'invalid'; problem: string }

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Reads a file the user chose. Anything it cannot vouch for comes back as
 * `invalid` with a sentence to show them — restoring a file we only half
 * recognise would wipe the real data to put back rubbish.
 */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { kind: 'invalid', problem: 'That file is not a Ledger backup' }
  }

  if (!isObject(raw) || raw.app !== BACKUP_APP) {
    return { kind: 'invalid', problem: 'That file is not a Ledger backup' }
  }

  const version = typeof raw.version === 'number' ? raw.version : 0
  const exportedAt = typeof raw.exportedAt === 'string' ? raw.exportedAt : ''

  if (raw.encrypted === true) {
    const kdf = raw.kdf
    const cipher = raw.cipher
    if (
      typeof raw.payload !== 'string' ||
      !isObject(kdf) ||
      typeof kdf.salt !== 'string' ||
      typeof kdf.iterations !== 'number' ||
      !isObject(cipher) ||
      typeof cipher.iv !== 'string'
    ) {
      return { kind: 'invalid', problem: 'This encrypted backup is incomplete' }
    }

    return {
      kind: 'encrypted',
      envelope: {
        app: BACKUP_APP,
        version,
        exportedAt,
        encrypted: true,
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: kdf.iterations, salt: kdf.salt },
        cipher: { name: 'AES-GCM', iv: cipher.iv },
        payload: raw.payload,
      },
    }
  }

  if (!isObject(raw.data)) {
    return { kind: 'invalid', problem: 'This backup has no data in it' }
  }

  const data = emptyTables()
  for (const { key } of TABLE_LABELS) {
    const rows = (raw.data as Record<string, unknown>)[key]
    if (rows === undefined) continue
    if (!Array.isArray(rows)) {
      return { kind: 'invalid', problem: `The ${key} in this backup are damaged` }
    }
    // The shape of a row is trusted from here: it was written by this app,
    // and the tables are typed on the way back into Dexie.
    ;(data as unknown as Record<string, unknown[]>)[key] = rows
  }

  return { kind: 'plain', envelope: { app: BACKUP_APP, version, exportedAt, data } }
}

export interface BackupSummary {
  exportedAt: Timestamp
  /** "1,284 transactions · 9 loans · 5 accounts", longest tables first. */
  lines: Array<{ label: string; count: number }>
  rows: number
  /** Spelled out when the file comes from a newer version of the app. */
  warning?: string
}

/** The preview card on the restore step. */
export function summarise(envelope: BackupEnvelope, top = 3): BackupSummary {
  const lines = TABLE_LABELS.map(({ key, label }) => ({
    label,
    count: envelope.data[key].length,
  })).filter((line) => line.count > 0)

  const rows = lines.reduce((total, line) => total + line.count, 0)
  const ranked = [...lines].sort((a, b) => b.count - a.count).slice(0, top)

  return {
    exportedAt: envelope.exportedAt,
    lines: ranked,
    rows,
    ...(envelope.version > BACKUP_VERSION
      ? { warning: 'This backup was made by a newer version of Ledger' }
      : {}),
  }
}

// ---- encryption ----------------------------------------------------------

const encoder = new TextEncoder()
const decoder = new TextDecoder()

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, hash: 'SHA-256', iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Wraps an envelope in AES-GCM under a key stretched from the password.
 * The password is never stored: a forgotten one means a lost backup, which
 * the screen says before turning this on.
 */
export async function encryptBackup(
  envelope: BackupEnvelope,
  password: string,
): Promise<EncryptedEnvelope> {
  if (password === '') throw new Error('Choose a password for the backup')

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt, KDF_ITERATIONS)

  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encoder.encode(JSON.stringify(envelope)),
  )

  return {
    app: BACKUP_APP,
    version: envelope.version,
    exportedAt: envelope.exportedAt,
    encrypted: true,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: KDF_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
    payload: bytesToBase64(new Uint8Array(cipher)),
  }
}

/** Throws a sentence the screen can show when the password is wrong. */
export async function decryptBackup(
  envelope: EncryptedEnvelope,
  password: string,
): Promise<BackupEnvelope> {
  const key = await deriveKey(
    password,
    base64ToBytes(envelope.kdf.salt),
    envelope.kdf.iterations,
  )

  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(envelope.cipher.iv) as BufferSource },
      key,
      base64ToBytes(envelope.payload) as BufferSource,
    )
  } catch {
    // GCM fails closed: a wrong password and a tampered file are the same
    // error, and both mean the same thing to the user.
    throw new Error('Wrong password, or the file is damaged')
  }

  const parsed = parseBackup(decoder.decode(plain))
  if (parsed.kind !== 'plain') {
    throw new Error('This backup decrypted into something unreadable')
  }
  return parsed.envelope
}

// ---- sizes ---------------------------------------------------------------

/** `formatBytes(4_404_019)` → `"4.2 MB"`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  const units = ['bytes', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = unit === 0 ? 0 : value < 10 ? 1 : value < 100 ? 1 : 0
  return `${value.toFixed(digits)} ${units[unit]}`
}
