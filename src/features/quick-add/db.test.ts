import { beforeEach, describe, expect, it } from 'vitest'
import { db, newId, stamp } from '@/db/db'
import type { Loan, LoanPayment, Transaction } from '@/db/types'
import { draftFromTransaction, type Draft } from './draft'
import { updateDraft } from './db'

/**
 * These exercise the shared `db` singleton, since that is what the
 * mutations write to. Each test starts from an empty set of tables.
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

/** The draft the sheet would open with, plus whatever the test changes. */
const edited = (source: Transaction, over: Partial<Draft> = {}): Draft => ({
  ...draftFromTransaction(source),
  ...over,
})

beforeEach(reset)

describe('updateDraft', () => {
  it('saves the fields the form owns', async () => {
    const row = txn()
    await db.transactions.add(row)

    await updateDraft(
      row.id,
      edited(row, { amountInput: '350.50', note: 'Lunch with the team #work #food' }),
    )

    const after = await db.transactions.get(row.id)
    expect(after?.amount).toBe(350_50)
    expect(after?.note).toBe('Lunch with the team')
    expect(after?.tags).toEqual(['work', 'food'])
  })

  it('leaves an unchanged draft exactly as it was', async () => {
    const row = txn()
    await db.transactions.add(row)

    await updateDraft(row.id, edited(row))

    const after = await db.transactions.get(row.id)
    expect({ ...after, updatedAt: row.updatedAt }).toEqual(row)
  })

  it('keeps status, so editing a pending entry does not post it', async () => {
    const row = txn({ status: 'pending', recurringId: 'rule-1' })
    await db.transactions.add(row)

    await updateDraft(row.id, edited(row, { amountInput: '500' }))

    const after = await db.transactions.get(row.id)
    expect(after?.status).toBe('pending')
    expect(after?.recurringId).toBe('rule-1')
  })

  it('keeps createdAt and moves updatedAt', async () => {
    const row = txn({ createdAt: '2020-01-01T00:00:00.000Z' })
    await db.transactions.add(row)

    await updateDraft(row.id, edited(row, { amountInput: '1' }))

    const after = await db.transactions.get(row.id)
    expect(after?.createdAt).toBe('2020-01-01T00:00:00.000Z')
    expect(after?.updatedAt).not.toBe(row.updatedAt)
  })

  it('drops the destination when a transfer stops being one', async () => {
    const row = txn({ type: 'transfer', toAccountId: 'bpi', categoryId: undefined })
    await db.transactions.add(row)

    await updateDraft(
      row.id,
      edited(row, { type: 'expense', toAccountId: undefined, categoryId: 'food' }),
    )

    const after = await db.transactions.get(row.id)
    expect(after?.type).toBe('expense')
    expect(after?.toAccountId).toBeUndefined()
    expect(after?.categoryId).toBe('food')
  })

  it('drops the category when an expense becomes a transfer', async () => {
    const row = txn()
    await db.transactions.add(row)

    await updateDraft(
      row.id,
      edited(row, { type: 'transfer', toAccountId: 'bpi', categoryId: undefined }),
    )

    const after = await db.transactions.get(row.id)
    expect(after?.categoryId).toBeUndefined()
    expect(after?.toAccountId).toBe('bpi')
  })

  it('refuses an entry that is no longer there', async () => {
    await expect(updateDraft('nope', edited(txn()))).rejects.toThrow('no longer exists')
  })

  describe('receipts', () => {
    const photo = () => ({ blob: new Blob(['x']), mime: 'image/jpeg', size: 1 })

    it('leaves the stored photo alone when the draft still points at it', async () => {
      const row = txn({ receiptId: 'r1' })
      await db.receipts.add({ id: 'r1', ...photo(), ...stamp() })
      await db.transactions.add(row)

      await updateDraft(row.id, edited(row, { amountInput: '400' }))

      expect((await db.transactions.get(row.id))?.receiptId).toBe('r1')
      expect(await db.receipts.get('r1')).toBeDefined()
    })

    it('removes the photo and its row when it is taken off', async () => {
      const row = txn({ receiptId: 'r1' })
      await db.receipts.add({ id: 'r1', ...photo(), ...stamp() })
      await db.transactions.add(row)

      await updateDraft(row.id, edited(row, { receiptId: undefined }))

      expect((await db.transactions.get(row.id))?.receiptId).toBeUndefined()
      expect(await db.receipts.get('r1')).toBeUndefined()
    })

    it('replaces the old photo rather than orphaning it', async () => {
      const row = txn({ receiptId: 'r1' })
      await db.receipts.add({ id: 'r1', ...photo(), ...stamp() })
      await db.transactions.add(row)

      await updateDraft(row.id, edited(row, { receipt: photo() }))

      const after = await db.transactions.get(row.id)
      expect(after?.receiptId).toBeDefined()
      expect(after?.receiptId).not.toBe('r1')
      expect(await db.receipts.get('r1')).toBeUndefined()
      expect(await db.receipts.count()).toBe(1)
    })

    it('attaches a photo to an entry that had none', async () => {
      const row = txn()
      await db.transactions.add(row)

      await updateDraft(row.id, edited(row, { receipt: photo() }))

      expect((await db.transactions.get(row.id))?.receiptId).toBeDefined()
      expect(await db.receipts.count()).toBe(1)
    })
  })

  describe('entries that are half of something else', () => {
    const loanPaymentTxn = async () => {
      const row = txn({ type: 'income', loanId: 'loan-1', note: 'Repayment · Dinner' })
      await db.transactions.add(row)
      const payment: LoanPayment = {
        id: newId(),
        loanId: 'loan-1',
        amount: row.amount,
        date: row.date,
        transactionId: row.id,
        ...stamp(),
      }
      await db.loanPayments.add(payment)
      return row
    }

    it('refuses a loan repayment, as deleting one does', async () => {
      const row = await loanPaymentTxn()

      await expect(updateDraft(row.id, edited(row, { amountInput: '1' }))).rejects.toThrow(
        'it is a loan payment',
      )
    })

    it('leaves the repayment untouched when it refuses', async () => {
      const row = await loanPaymentTxn()

      await expect(updateDraft(row.id, edited(row, { amountInput: '1' }))).rejects.toThrow()

      expect((await db.transactions.get(row.id))?.amount).toBe(289_00)
    })

    const splitExpense = async () => {
      const row = txn()
      await db.transactions.add(row)
      const loan: Loan = {
        id: newId(),
        kind: 'personal',
        direction: 'lent',
        contactId: 'c1',
        principal: 100_00,
        startDate: row.date,
        note: 'Lunch with team',
        splitFromTxnId: row.id,
        status: 'open',
        ...stamp(),
      }
      await db.loans.add(loan)
      return row
    }

    it('refuses to change the type of an expense that has been split', async () => {
      const row = await splitExpense()

      await expect(
        updateDraft(row.id, edited(row, { type: 'income', categoryId: 'salary' })),
      ).rejects.toThrow('Remove the split')
    })

    it('still allows the rest of a split expense to be edited', async () => {
      const row = await splitExpense()

      await updateDraft(row.id, edited(row, { amountInput: '400', note: 'Dinner' }))

      const after = await db.transactions.get(row.id)
      expect(after?.amount).toBe(400_00)
      expect(after?.note).toBe('Dinner')
      // The loans a split made are snapshots that stand on their own.
      expect(await db.loans.count()).toBe(1)
    })
  })
})
