/**
 * The decisions behind cloud sync, kept away from Dexie and Firestore so
 * they can be tested on their own.
 *
 * The shape of the thing: IndexedDB stays the source of truth and every
 * write lands there first, offline or not. A change also drops a note in
 * an outbox table, and the outbox is drained to Firestore whenever there
 * is a network. Nothing in the app ever waits on the cloud.
 */

/**
 * What goes up. Receipts are left out because they are Blobs — those
 * belong in Cloud Storage, not in a document. Settings are left out
 * because they hold the PIN hash, the passkey handle and this device's
 * own preferences: none of it is ledger data, and some of it should not
 * leave the device at all.
 */
export const SYNCED_TABLES = [
  'accounts',
  'categories',
  'transactions',
  'recurring',
  'contacts',
  'loans',
  'loanPayments',
  'budgets',
  'goals',
] as const

export type SyncedTable = (typeof SYNCED_TABLES)[number]

export function isSyncedTable(name: string): name is SyncedTable {
  return (SYNCED_TABLES as readonly string[]).includes(name)
}

export type OutboxOp = 'put' | 'delete'

/**
 * One entry per row, not per edit: the outbox records *that* a row
 * changed, and the row itself is read when the batch is sent. Editing a
 * transaction ten times offline is one upload, carrying the tenth value.
 */
export const outboxKey = (table: string, rowId: string): string => `${table}:${rowId}`

/**
 * Firestore allows 500 operations in a batched write. Staying under it
 * leaves room to be wrong about what counts as one.
 */
export const BATCH_LIMIT = 450

export function chunk<T>(items: readonly T[], size = BATCH_LIMIT): T[][] {
  if (size < 1) throw new RangeError('chunk size must be at least 1')
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Firestore rejects a document with an `undefined` in it, and optional
 * fields — a transfer's `toAccountId`, a loan's `ratePct` — are absent
 * exactly that way. Dropping the key is what the reader expects anyway:
 * `row.ratePct` is undefined either way.
 */
export function forFirestore<T extends object>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

/** Where sync stands, in the order the row should prefer to say it. */
export type SyncState =
  | 'off' // the user has not turned it on
  | 'unconfigured' // no Firebase project in this build
  | 'offline' // on, with changes waiting for a network
  | 'pending' // on, with changes going up now
  | 'synced' // on, and the cloud has everything
  | 'error' // on, and the last attempt did not work

/**
 * Spelled out rather than built from fragments, because these are the
 * sentences a person reads to decide whether their data is safe.
 */
export const SYNC_HINT: Readonly<Record<SyncState, string>> = {
  off: 'Keep a copy of this ledger in the cloud',
  unconfigured: 'This build has no Firebase project connected',
  offline: 'Saved on this device — waiting for a network',
  pending: 'Sending changes',
  synced: 'Everything on this device is in the cloud',
  error: 'Could not reach the cloud. It will try again',
}

/**
 * The state a row should show, from the three things that decide it.
 * Offline outranks error: a queue that is waiting for a network has not
 * gone wrong, and saying so would send someone looking for a fault.
 */
export function syncStateFrom(options: {
  enabled: boolean
  configured: boolean
  online: boolean
  queued: number
  failed: boolean
}): SyncState {
  if (!options.configured) return 'unconfigured'
  if (!options.enabled) return 'off'
  if (options.queued === 0) return 'synced'
  if (!options.online) return 'offline'
  return options.failed ? 'error' : 'pending'
}

/** "3 changes waiting", for the row's value column. */
export function queuedLabel(queued: number): string {
  if (queued === 0) return 'Up to date'
  return queued === 1 ? '1 change waiting' : `${queued} changes waiting`
}
