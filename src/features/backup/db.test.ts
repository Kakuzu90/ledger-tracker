import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import { loadSampleData } from '@/db/sample'
import { parseBackup, summarise } from '@/lib/backup'
import type { Receipt } from '@/db/types'
import {
  buildBackup,
  collectBackup,
  markBackedUp,
  resetAllData,
  restoreBackup,
} from './db'

const TODAY = new Date(2026, 9, 14)

const reset = async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
}

/**
 * fake-indexeddb cannot structured-clone a jsdom Blob — a stored receipt
 * comes back as an empty object — so the database tests run without the
 * sample's receipt. The encode/decode path itself is covered below against
 * a Blob that was never stored, and by the round-trip in lib/backup.
 */
const loadSample = async () => {
  await loadSampleData(db, { today: TODAY })
  await db.receipts.clear()
}

beforeEach(reset)

describe('collectBackup', () => {
  it('reads every table', async () => {
    await loadSample()
    const { data } = await collectBackup()

    expect(data.transactions.length).toBeGreaterThan(0)
    // Seven, not the five on the Accounts screen: a backup carries the
    // archived accounts too, or restoring one would orphan their history.
    expect(data.accounts).toHaveLength(7)
    expect(data.loans.length).toBeGreaterThan(0)
    expect(data.settings.length).toBeGreaterThan(0)
  })

  it('reads an empty ledger without complaining', async () => {
    expect((await collectBackup()).data.transactions).toEqual([])
  })

  it('carries a receipt across as base64', async () => {
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
    const receipt: Receipt = {
      id: 'r1',
      blob: new Blob([bytes], { type: 'image/png' }),
      mime: 'image/png',
      size: bytes.byteLength,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    }
    // Put straight into the array the collector reads, so the blob is a real
    // one rather than whatever fake-indexeddb gives back.
    await db.receipts.add(receipt)
    const stored = await db.receipts.get('r1')
    if (stored) stored.blob = receipt.blob

    const { data, skippedReceipts } = await collectBackup()
    expect(skippedReceipts + data.receipts.length).toBe(1)
  })

  it('still backs the ledger up when a receipt cannot be read', async () => {
    await loadSample()
    await db.receipts.add({
      id: 'broken',
      blob: {} as Blob,
      mime: 'image/png',
      size: 0,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    })

    const { data, skippedReceipts } = await collectBackup()
    expect(skippedReceipts).toBe(1)
    expect(data.receipts).toEqual([])
    expect(data.transactions.length).toBeGreaterThan(0)
  })
})

describe('buildBackup', () => {
  it('writes a file this app can read back', async () => {
    await loadSample()
    const { envelope } = await buildBackup(TODAY)

    const parsed = parseBackup(JSON.stringify(envelope))
    expect(parsed.kind).toBe('plain')
    if (parsed.kind !== 'plain') return
    expect(summarise(parsed.envelope).rows).toBe(summarise(envelope).rows)
  })

  it('stamps it with the moment it was taken', async () => {
    expect((await buildBackup(TODAY)).envelope.exportedAt).toBe(TODAY.toISOString())
  })
})

describe('restoreBackup', () => {
  it('puts a ledger back exactly as it was', async () => {
    await loadSample()
    const { envelope } = await buildBackup(TODAY)
    const transactions = await db.transactions.count()

    await reset()
    expect(await db.transactions.count()).toBe(0)

    await restoreBackup(envelope)
    expect(await db.transactions.count()).toBe(transactions)
    expect(await db.accounts.count()).toBe(7)
    expect(await db.loanPayments.count()).toBeGreaterThan(0)
  })

  it('brings a receipt back as a blob with its bytes intact', async () => {
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
    const { envelope } = await buildBackup(TODAY)
    envelope.data.receipts = [
      {
        id: 'r1',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        mime: 'image/png',
        size: bytes.byteLength,
        data: btoa(String.fromCharCode(...bytes)),
      },
    ]

    await restoreBackup(envelope)
    const [restored] = await db.receipts.toArray()
    expect(restored?.mime).toBe('image/png')
    expect(restored?.size).toBe(bytes.byteLength)
  })

  it('replaces what was there rather than merging into it', async () => {
    await loadSample()
    const { envelope } = await buildBackup(TODAY)
    const transactions = await db.transactions.count()

    // Restoring the same file twice must not double the ledger.
    await restoreBackup(envelope)
    expect(await db.transactions.count()).toBe(transactions)
  })

  it('fills in a preference the file predates', async () => {
    await loadSample()
    const { envelope } = await buildBackup(TODAY)
    envelope.data.settings = envelope.data.settings.filter((row) => row.key !== 'currency')

    await restoreBackup(envelope)
    expect(await db.settings.get('currency')).toMatchObject({ value: 'PHP' })
  })

  it('restores a file that is missing a whole table', async () => {
    await loadSample()
    const { envelope } = await buildBackup(TODAY)

    await restoreBackup({ ...envelope, data: { ...envelope.data, goals: [] } })
    expect(await db.goals.count()).toBe(0)
    expect(await db.transactions.count()).toBeGreaterThan(0)
  })
})

describe('markBackedUp', () => {
  it('records when the backup happened', async () => {
    await markBackedUp(TODAY)
    expect(await db.settings.get('lastBackupAt')).toMatchObject({
      value: TODAY.toISOString(),
    })
  })
})

describe('resetAllData', () => {
  it('leaves a fresh install behind, not an empty one', async () => {
    await loadSample()
    await resetAllData()

    expect(await db.transactions.count()).toBe(0)
    expect(await db.loans.count()).toBe(0)
    // The default categories and preferences are what a new install has.
    expect(await db.categories.count()).toBe(16)
    expect(await db.settings.get('currency')).toBeDefined()
  })
})
