/**
 * Watching the ledger for changes, so cloud sync does not have to be
 * threaded through forty call sites.
 *
 * Dexie's table hooks see every write — `put`, `update`, `modify`,
 * `bulkAdd`, `delete` — wherever in the app it came from. A change is
 * noted in the outbox, and `features/sync` drains it when there is a
 * network. Nothing here knows that Firestore exists.
 */

import type { Transaction as DexieTransaction } from 'dexie'
import { isSyncedTable, outboxKey, SYNCED_TABLES, type OutboxOp } from '@/lib/sync'
import type { LedgerDB } from './db'
import type { OutboxEntry } from './types'

/**
 * Off until the user turns sync on. Someone who never does should not
 * be accumulating a queue nobody will read.
 */
let capturing = false

export function setCapturing(on: boolean): void {
  capturing = on
}

export const isCapturing = (): boolean => capturing

/** Told after each commit, so a flush can be kicked off promptly. */
const listeners = new Set<() => void>()

export function onOutboxChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Entries are gathered per transaction and written once it commits:
 * a write that is rolled back must not leave an upload behind, and a
 * `bulkAdd` of a thousand rows should not add a thousand listeners.
 */
const pending = new WeakMap<DexieTransaction, Map<string, OutboxEntry>>()

export function captureChanges(db: LedgerDB): void {
  for (const name of SYNCED_TABLES) {
    const table = db.table(name)
    table.hook('creating', function (primKey, _obj, tx) {
      record(db, tx, name, primKey, 'put')
    })
    table.hook('updating', function (_mods, primKey, _obj, tx) {
      record(db, tx, name, primKey, 'put')
    })
    table.hook('deleting', function (primKey, _obj, tx) {
      record(db, tx, name, primKey, 'delete')
    })
  }
}

function record(
  db: LedgerDB,
  tx: DexieTransaction,
  table: string,
  primKey: unknown,
  op: OutboxOp,
): void {
  if (!capturing || typeof primKey !== 'string') return

  let bucket = pending.get(tx)
  if (!bucket) {
    const fresh = new Map<string, OutboxEntry>()
    bucket = fresh
    pending.set(tx, fresh)
    tx.on('complete', () => void commit(db, fresh))
  }

  // Keyed by row, so the tenth edit of a transaction replaces the first
  // and a delete after a create wins — which is what the cloud needs to
  // end up with either way.
  bucket.set(outboxKey(table, primKey), {
    key: outboxKey(table, primKey),
    table,
    rowId: primKey,
    op,
    queuedAt: new Date().toISOString(),
  })
}

async function commit(db: LedgerDB, bucket: Map<string, OutboxEntry>): Promise<void> {
  try {
    await db.outbox.bulkPut([...bucket.values()])
    for (const listener of listeners) listener()
  } catch {
    // The write itself has already happened and is safe on this device.
    // A lost outbox entry means the row is re-sent by the next full
    // sweep, not that anything is gone.
  }
}

/**
 * Queues the whole ledger. Used when sync is first turned on, and as a
 * safety net after a restore or a reset — those replace every row at
 * once, and re-sending is cheaper than reasoning about what the hooks
 * saw.
 */
export async function queueEverything(db: LedgerDB): Promise<void> {
  const queuedAt = new Date().toISOString()

  for (const table of SYNCED_TABLES) {
    const ids = (await db.table(table).toCollection().primaryKeys()) as string[]
    await db.outbox.bulkPut(
      ids.map((rowId) => ({
        key: outboxKey(table, rowId),
        table,
        rowId,
        op: 'put' as const,
        queuedAt,
      })),
    )
  }

  for (const listener of listeners) listener()
}

/** Guard for an entry read back out of the table. */
export const entryIsSyncable = (entry: OutboxEntry): boolean => isSyncedTable(entry.table)
