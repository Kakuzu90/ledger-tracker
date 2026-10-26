/**
 * Draining the outbox into Firestore.
 *
 * The ledger is written to IndexedDB first, always — this runs after
 * the fact and never blocks a save. With no network the queue simply
 * grows; when one appears it is sent. Firebase is imported lazily, so a
 * build with sync switched off never downloads the SDK.
 *
 * One direction only, for now. Sign-in is anonymous, which means a uid
 * per browser install rather than per person, so there is no second
 * writer to merge with and nothing to pull down: this is a cloud copy
 * of this device's ledger, not cross-device sync. Making it two-way is
 * a question of a real sign-in, not of this file.
 */

import { getDeviceUid, getFirestoreDb, isFirebaseConfigured } from '@/lib/firebase'
import { BATCH_LIMIT, forFirestore, SYNCED_TABLES, type SyncedTable } from '@/lib/sync'
import { db } from '@/db/db'
import { onOutboxChange, queueEverything, setCapturing } from '@/db/outbox'
import { getSetting, setSetting } from '@/db/settings'
import type { OutboxEntry } from '@/db/types'

const ENABLED_KEY = 'cloudSync'
const LAST_AT_KEY = 'cloudSyncAt'
/** Set when sync is switched on: see `removeStrandedDocs`. */
const RECONCILE_KEY = 'cloudSyncReconcile'

export const syncEnabled = (): Promise<boolean> => getSetting(ENABLED_KEY, false)
export const lastSyncedAt = (): Promise<string | null> => getSetting<string | null>(LAST_AT_KEY, null)

/** Whether the last attempt failed, for the Settings row. In memory: a
 *  failure that does not survive a reload was not worth reporting. */
let failed = false
export const lastAttemptFailed = (): boolean => failed

/**
 * Told when an attempt finishes. Without this the row has no reason to
 * re-render after a failure — the queued count it watches does not move
 * when nothing went up, so "Sending changes" would stay on screen for a
 * send that had already given up.
 */
const settled = new Set<() => void>()

export function onSyncSettled(listener: () => void): () => void {
  settled.add(listener)
  return () => settled.delete(listener)
}

const announceSettled = () => {
  for (const listener of settled) listener()
}

/**
 * Turns it on and queues everything already in the ledger, so the first
 * upload is the whole thing rather than only what changes next.
 */
export async function enableSync(): Promise<void> {
  await setSetting(ENABLED_KEY, true)
  // Rows deleted while sync was off left no trace, so a cloud copy from
  // an earlier session can hold things this ledger no longer has. This
  // is the one moment worth paying a full read to find them.
  await setSetting(RECONCILE_KEY, true)
  setCapturing(true)
  await queueEverything(db)
  void flushOutbox()
}

/**
 * Stops sending. What is already in the cloud stays there — this is the
 * switch for "stop copying", not for "delete the copy", and quietly
 * doing the second would be the wrong read of the first.
 */
export async function disableSync(): Promise<void> {
  await setSetting(ENABLED_KEY, false)
  setCapturing(false)
  await db.outbox.clear()
  failed = false
}

/**
 * Re-sends the whole ledger. Called after a restore or a reset, which
 * replace every row at once: the hooks do see that happen, and this is
 * the cheap insurance that nothing in a thousand-row swap was missed.
 */
export async function queueFullSync(): Promise<void> {
  if (!(await syncEnabled())) return
  await queueEverything(db)
  void flushOutbox()
}

let running: Promise<void> | null = null

/** Sends what is queued. Safe to call often; only one runs at a time. */
export function flushOutbox(): Promise<void> {
  running ??= drain().finally(() => {
    running = null
    announceSettled()
  })
  return running
}

async function drain(): Promise<void> {
  if (!(await syncEnabled()) || !isFirebaseConfigured()) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  if ((await db.outbox.count()) === 0) return

  const [uid, store] = await Promise.all([getDeviceUid(), getFirestoreDb()])
  if (!uid || !store) {
    failed = true
    return
  }

  const { doc, writeBatch } = await import('firebase/firestore')

  try {
    if (await getSetting(RECONCILE_KEY, false)) {
      await removeStrandedDocs(uid, store)
      await setSetting(RECONCILE_KEY, false)
    }

    // A page at a time rather than everything at once: the first launch
    // after turning sync on can have thousands of rows queued, and a
    // batch that is interrupted should cost one page, not the lot.
    for (;;) {
      const entries = await db.outbox.orderBy('queuedAt').limit(BATCH_LIMIT).toArray()
      if (entries.length === 0) break

      const batch = writeBatch(store)
      for (const entry of entries) {
        const ref = doc(store, 'users', uid, entry.table, entry.rowId)
        const row = entry.op === 'put' ? await currentRow(entry) : undefined
        // A row queued as a change and since deleted is a delete. The
        // outbox holds keys, not copies, so this is the first chance to
        // notice.
        if (row) batch.set(ref, forFirestore(row))
        else batch.delete(ref)
      }

      await batch.commit()
      await db.outbox.bulkDelete(entries.map((entry) => entry.key))
    }

    await setSetting(LAST_AT_KEY, new Date().toISOString())
    failed = false
  } catch {
    // Left in the outbox on purpose: whatever did not go up is still
    // queued, and the next online event or launch tries again.
    failed = true
  }
}

async function currentRow(entry: OutboxEntry): Promise<object | undefined> {
  return db.table(entry.table).get(entry.rowId) as Promise<object | undefined>
}

/**
 * Deletes cloud documents with no row behind them any more. Only when
 * sync is switched on, because finding them means reading every
 * collection in full.
 */
async function removeStrandedDocs(
  uid: string,
  store: Awaited<ReturnType<typeof getFirestoreDb>>,
): Promise<void> {
  if (!store) return
  const { collection, doc, getDocs, writeBatch } = await import('firebase/firestore')

  for (const table of SYNCED_TABLES) {
    const remote = await getDocs(collection(store, 'users', uid, table))
    const local = new Set(
      (await db.table(table as SyncedTable).toCollection().primaryKeys()) as string[],
    )

    const stranded = remote.docs.filter((found) => !local.has(found.id))
    if (stranded.length === 0) continue

    const batch = writeBatch(store)
    for (const found of stranded) batch.delete(doc(store, 'users', uid, table, found.id))
    await batch.commit()
  }
}

/**
 * Wires sync up for the life of the app: flush at launch, flush when a
 * network comes back, flush shortly after a change. Returns the undo.
 */
export async function startSync(): Promise<() => void> {
  if (!(await syncEnabled())) return () => {}
  setCapturing(true)

  let timer: ReturnType<typeof setTimeout> | undefined
  // Edits arrive in bursts — a split writes a transaction and four
  // loans — and one upload for the burst beats five.
  const soon = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void flushOutbox(), 1500)
  }

  const stopWatching = onOutboxChange(soon)
  const onOnline = () => void flushOutbox()
  window.addEventListener('online', onOnline)

  void flushOutbox()

  return () => {
    clearTimeout(timer)
    stopWatching()
    window.removeEventListener('online', onOnline)
  }
}
