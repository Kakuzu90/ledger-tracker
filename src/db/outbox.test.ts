import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LedgerDB, stamp } from './db'
import { queueEverything, setCapturing } from './outbox'
import type { Account, Transaction } from './types'

/**
 * The outbox is the one thing between a local write and the cloud, and
 * it works by hooking Dexie rather than by being called — so what it
 * does or does not see is worth pinning down. `bulkAdd` and `clear()`
 * in particular behave differently, and the difference is the reason
 * `queueFullSync` exists.
 */

let db: LedgerDB
let n = 0

const account = (id: string): Account => ({
  id,
  name: 'Cash',
  type: 'cash',
  currency: 'PHP',
  openingBalance: 0,
  color: '#000',
  archived: false,
  ...stamp(),
})

const transaction = (id: string): Transaction => ({
  id,
  type: 'expense',
  amount: 1200,
  accountId: 'acct',
  date: '2026-10-26',
  note: '',
  tags: [],
  status: 'posted',
  ...stamp(),
})

beforeEach(async () => {
  db = new LedgerDB(`outbox-test-${++n}`)
  await db.open()
  setCapturing(true)
})

afterEach(async () => {
  setCapturing(false)
  await db.delete()
})

describe('capturing changes', () => {
  it('queues a row that is added', async () => {
    await db.accounts.add(account('a1'))
    expect(await db.outbox.toArray()).toEqual([
      expect.objectContaining({ key: 'accounts:a1', table: 'accounts', rowId: 'a1', op: 'put' }),
    ])
  })

  it('queues rows added in bulk — a split writes four loans at once', async () => {
    await db.transactions.bulkAdd([transaction('t1'), transaction('t2'), transaction('t3')])
    const keys = (await db.outbox.toArray()).map((entry) => entry.key).sort()
    expect(keys).toEqual(['transactions:t1', 'transactions:t2', 'transactions:t3'])
  })

  it('collapses repeated edits of one row into a single upload', async () => {
    await db.transactions.add(transaction('t1'))
    await db.transactions.update('t1', { amount: 1300 })
    await db.transactions.update('t1', { amount: 1400 })

    expect(await db.outbox.count()).toBe(1)
    expect((await db.outbox.get('transactions:t1'))?.op).toBe('put')
  })

  it('turns a delete into a delete, even after the row was changed', async () => {
    await db.transactions.add(transaction('t1'))
    await db.transactions.update('t1', { amount: 1300 })
    await db.transactions.delete('t1')

    expect(await db.outbox.count()).toBe(1)
    expect((await db.outbox.get('transactions:t1'))?.op).toBe('delete')
  })

  it('queues nothing for a transaction that rolls back', async () => {
    await expect(
      db.transaction('rw', db.transactions, async () => {
        await db.transactions.add(transaction('t1'))
        throw new Error('no')
      }),
    ).rejects.toThrow('no')

    // The row is not there, so neither should the instruction to upload it be.
    expect(await db.transactions.get('t1')).toBeUndefined()
    expect(await db.outbox.count()).toBe(0)
  })

  it('ignores the tables that never go up', async () => {
    await db.settings.put({ key: 'theme', value: 'dark' })
    await db.receipts.add({ id: 'r1', blob: new Blob(['x']), mime: 'image/png', size: 1, ...stamp() })
    expect(await db.outbox.count()).toBe(0)
  })

  it('records nothing at all while capturing is off', async () => {
    setCapturing(false)
    await db.accounts.add(account('a1'))
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('queueEverything', () => {
  it('queues every row in every synced table', async () => {
    setCapturing(false)
    await db.accounts.bulkAdd([account('a1'), account('a2')])
    await db.transactions.add(transaction('t1'))
    await db.settings.put({ key: 'theme', value: 'dark' })

    await queueEverything(db)

    const keys = (await db.outbox.toArray()).map((entry) => entry.key).sort()
    expect(keys).toEqual(['accounts:a1', 'accounts:a2', 'transactions:t1'])
  })

  it('is not needed for clear(), which does queue a delete per row', async () => {
    // Older Dexie skipped the hooks for `clear()` for speed. Dexie 4
    // does not, which is what makes a restore — clear then bulkAdd —
    // reach the cloud on its own.
    await db.accounts.add(account('a1'))
    await db.outbox.clear()

    await db.accounts.clear()
    expect(await db.outbox.toArray()).toEqual([
      expect.objectContaining({ key: 'accounts:a1', op: 'delete' }),
    ])
  })
})
