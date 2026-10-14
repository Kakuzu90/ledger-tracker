import { beforeEach, describe, expect, it } from 'vitest'
import { db, newId, stamp } from '@/db/db'
import type { Recurring, Transaction } from '@/db/types'
import {
  confirmPending,
  deleteTransaction,
  duplicateTransaction,
  makeRecurring,
  restoreTransaction,
  setReceipt,
  restorePending,
  skipPending,
} from './db'

/**
 * These exercise the shared `db` singleton, since that is what the mutations
 * write to. Each test starts from an empty set of tables.
 */
const reset = async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
}

const txn = (over: Partial<Transaction> = {}): Transaction => ({
  id: newId(),
  type: 'expense',
  amount: 289_00,
  accountId: 'gcash',
  categoryId: 'food',
  date: '2026-10-14',
  note: 'Lunch with team',
  tags: ['work'],
  status: 'posted',
  ...stamp(),
  ...over,
})

const rule = (over: Partial<Recurring> = {}): Recurring => ({
  id: newId(),
  template: { type: 'expense', amount: 149_00, accountId: 'gcash', note: 'Spotify', tags: [] },
  freq: 'monthly',
  interval: 1,
  startDate: '2026-04-14',
  nextDate: '2026-10-14',
  mode: 'confirm',
  ...stamp(),
  ...over,
})

beforeEach(reset)

describe('deleteTransaction and restoreTransaction', () => {
  it('removes the row and hands back what it took', async () => {
    const row = txn()
    await db.transactions.add(row)

    const deleted = await deleteTransaction(row.id)

    expect(await db.transactions.get(row.id)).toBeUndefined()
    expect(deleted.transaction.note).toBe('Lunch with team')
  })

  it('puts the row back exactly, tags and all', async () => {
    const row = txn()
    await db.transactions.add(row)

    await restoreTransaction(await deleteTransaction(row.id))

    expect(await db.transactions.get(row.id)).toEqual(row)
  })

  it('takes the receipt with it and brings it back', async () => {
    const receiptId = newId()
    await db.receipts.add({
      id: receiptId,
      blob: new Blob(['x']),
      mime: 'image/png',
      size: 1,
      ...stamp(),
    })
    const row = txn({ receiptId })
    await db.transactions.add(row)

    const deleted = await deleteTransaction(row.id)
    // An orphaned blob nothing points at would otherwise sit there forever.
    expect(await db.receipts.get(receiptId)).toBeUndefined()
    expect(deleted.receipt).toBeDefined()

    await restoreTransaction(deleted)
    expect(await db.receipts.get(receiptId)).toBeDefined()
  })

  it('refuses to delete a loan payment from here', async () => {
    const row = txn()
    await db.transactions.add(row)
    await db.loanPayments.add({
      id: newId(),
      loanId: 'loan-1',
      amount: row.amount,
      date: row.date,
      transactionId: row.id,
      ...stamp(),
    })

    // Deleting it would quietly change what someone owes.
    await expect(deleteTransaction(row.id)).rejects.toThrow('loan payment')
    expect(await db.transactions.get(row.id)).toBeDefined()
  })

  it('complains about a row that is already gone', async () => {
    await expect(deleteTransaction('nope')).rejects.toThrow('already gone')
  })
})

describe('duplicateTransaction', () => {
  it('copies the details to today under a new id', async () => {
    const row = txn({ date: '2026-09-02' })
    await db.transactions.add(row)

    const copyId = await duplicateTransaction(row.id, new Date(2026, 9, 14))
    const copy = await db.transactions.get(copyId)

    expect(copyId).not.toBe(row.id)
    expect(copy?.date).toBe('2026-10-14')
    expect(copy?.amount).toBe(row.amount)
    expect(copy?.note).toBe(row.note)
    expect(copy?.tags).toEqual(['work'])
  })

  it('leaves the original alone', async () => {
    const row = txn()
    await db.transactions.add(row)

    await duplicateTransaction(row.id)

    expect(await db.transactions.get(row.id)).toEqual(row)
    expect(await db.transactions.count()).toBe(2)
  })

  it('does not copy the receipt', async () => {
    const row = txn({ receiptId: 'r1' })
    await db.transactions.add(row)

    const copy = await db.transactions.get(await duplicateTransaction(row.id))

    // The photo is of one purchase; the copy is a different one.
    expect(copy?.receiptId).toBeUndefined()
  })

  it('cuts the copy loose from a recurring rule and a loan', async () => {
    const row = txn({ recurringId: 'rule-1', loanId: 'loan-1' })
    await db.transactions.add(row)

    const copy = await db.transactions.get(await duplicateTransaction(row.id))

    expect(copy?.recurringId).toBeUndefined()
    expect(copy?.loanId).toBeUndefined()
  })

  it('posts a copy of a pending entry', async () => {
    const row = txn({ status: 'pending' })
    await db.transactions.add(row)

    const copy = await db.transactions.get(await duplicateTransaction(row.id))

    expect(copy?.status).toBe('posted')
  })
})

describe('setReceipt', () => {
  it('attaches a photo', async () => {
    const row = txn()
    await db.transactions.add(row)

    await setReceipt(row.id, { blob: new Blob(['x']), mime: 'image/png', size: 1 })

    const updated = await db.transactions.get(row.id)
    expect(updated?.receiptId).toBeDefined()
    expect(await db.receipts.count()).toBe(1)
  })

  it('replaces the old photo rather than stacking them up', async () => {
    const row = txn()
    await db.transactions.add(row)

    await setReceipt(row.id, { blob: new Blob(['a']), mime: 'image/png', size: 1 })
    await setReceipt(row.id, { blob: new Blob(['b']), mime: 'image/png', size: 2 })

    expect(await db.receipts.count()).toBe(1)
    const updated = await db.transactions.get(row.id)
    expect((await db.receipts.get(updated!.receiptId!))?.size).toBe(2)
  })

  it('removes the photo and its blob', async () => {
    const row = txn()
    await db.transactions.add(row)
    await setReceipt(row.id, { blob: new Blob(['x']), mime: 'image/png', size: 1 })

    await setReceipt(row.id, null)

    expect(await db.receipts.count()).toBe(0)
    expect((await db.transactions.get(row.id))?.receiptId).toBeUndefined()
  })
})

describe('makeRecurring', () => {
  it('creates a monthly rule starting next month', async () => {
    const row = txn({ date: '2026-10-14' })
    await db.transactions.add(row)

    const ruleId = await makeRecurring(row.id)
    const created = await db.recurring.get(ruleId)

    expect(created?.freq).toBe('monthly')
    // This month's entry already exists, so the rule starts next month.
    expect(created?.nextDate).toBe('2026-11-14')
    expect(created?.mode).toBe('confirm')
    expect(created?.template.amount).toBe(289_00)
  })

  it('links the transaction to its new rule', async () => {
    const row = txn()
    await db.transactions.add(row)

    const ruleId = await makeRecurring(row.id)

    expect((await db.transactions.get(row.id))?.recurringId).toBe(ruleId)
  })
})

describe('confirmPending', () => {
  it('posts the entry', async () => {
    const recurring = rule()
    await db.recurring.add(recurring)
    const pending = txn({ status: 'pending', recurringId: recurring.id, amount: 149_00 })
    await db.transactions.add(pending)

    await confirmPending(pending.id)

    expect((await db.transactions.get(pending.id))?.status).toBe('posted')
  })

  it('leaves the rule where the scheduler put it', async () => {
    const recurring = rule({ nextDate: '2026-11-14' })
    await db.recurring.add(recurring)
    const pending = txn({ status: 'pending', recurringId: recurring.id })
    await db.transactions.add(pending)

    await confirmPending(pending.id)

    // runSchedule already advanced it when it made this entry; advancing
    // again here would skip a month every time the user says yes.
    expect((await db.recurring.get(recurring.id))?.nextDate).toBe('2026-11-14')
  })

  it('does nothing for an entry that has gone', async () => {
    await expect(confirmPending('nope')).resolves.toBeUndefined()
  })
})

describe('skipPending', () => {
  it('drops the entry and leaves the rule alone', async () => {
    const recurring = rule({ nextDate: '2026-11-14' })
    await db.recurring.add(recurring)
    const pending = txn({ status: 'pending', recurringId: recurring.id })
    await db.transactions.add(pending)

    await skipPending(pending.id)

    expect(await db.transactions.get(pending.id)).toBeUndefined()
    expect((await db.recurring.get(recurring.id))?.nextDate).toBe('2026-11-14')
  })

  it('hands back the entry so the skip can be undone', async () => {
    const pending = txn({ status: 'pending' })
    await db.transactions.add(pending)

    const skipped = await skipPending(pending.id)
    expect(skipped?.id).toBe(pending.id)
    expect(await db.transactions.get(pending.id)).toBeUndefined()

    await restorePending(skipped)
    const back = await db.transactions.get(pending.id)
    expect(back).toEqual(pending)
  })

  it('has nothing to hand back for an entry that is already gone', async () => {
    expect(await skipPending('nope')).toBeUndefined()
    // And restoring that nothing is a no-op rather than a crash.
    await expect(restorePending(undefined)).resolves.toBeUndefined()
    expect(await db.transactions.count()).toBe(0)
  })
})

describe('concurrent edits', () => {
  it('does not leave a receipt behind when a delete loses a race', async () => {
    const row = txn()
    await db.transactions.add(row)
    await setReceipt(row.id, { blob: new Blob(['x']), mime: 'image/png', size: 1 })

    const first = deleteTransaction(row.id)
    const second = deleteTransaction(row.id).catch(() => null)
    await Promise.all([first, second])

    expect(await db.transactions.count()).toBe(0)
    expect(await db.receipts.count()).toBe(0)
  })
})
