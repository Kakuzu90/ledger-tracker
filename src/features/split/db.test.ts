import { beforeEach, describe, expect, it } from 'vitest'
import { db, newId, stamp } from '@/db/db'
import type { Id, Transaction } from '@/db/types'
import { createContact, recordPayment } from '@/features/loans/db'
import { createSplit, removeSplit } from './db'

const reset = async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
}

const expense = async (over: Partial<Transaction> = {}): Promise<Id> => {
  const row: Transaction = {
    id: newId(),
    type: 'expense',
    amount: 4_800_00,
    accountId: 'account',
    date: '2026-10-10',
    note: 'Team dinner',
    tags: [],
    status: 'posted',
    ...stamp(),
    ...over,
  }
  await db.transactions.add(row)
  return row.id
}

beforeEach(reset)

describe('createSplit', () => {
  it('creates one open loan per person, pointing back at the expense', async () => {
    const txnId = await expense()
    const juan = await createContact('Juan')
    const maria = await createContact('Maria')

    const ids = await createSplit(txnId, [
      { contactId: juan, amount: 1_600_00 },
      { contactId: maria, amount: 1_600_00 },
    ])

    const loans = await db.loans.bulkGet(ids)
    expect(loans).toHaveLength(2)
    expect(loans[0]).toMatchObject({
      kind: 'personal',
      direction: 'lent',
      contactId: juan,
      principal: 1_600_00,
      startDate: '2026-10-10',
      note: 'Team dinner',
      splitFromTxnId: txnId,
      status: 'open',
    })
  })

  it('moves no money — the expense already did', async () => {
    const txnId = await expense()
    const juan = await createContact('Juan')

    await createSplit(txnId, [{ contactId: juan, amount: 2_400_00 }])

    // Still just the original expense.
    expect(await db.transactions.count()).toBe(1)
    expect((await db.transactions.get(txnId))?.amount).toBe(4_800_00)
  })

  it('falls back to the category name when the expense has no note', async () => {
    const categoryId = newId()
    await db.categories.add({
      id: categoryId,
      name: 'Dining out',
      kind: 'expense',
      color: '#E07A3F',
      order: 1,
      archived: false,
      ...stamp(),
    })
    const txnId = await expense({ note: '', categoryId })
    const juan = await createContact('Juan')

    const [id] = await createSplit(txnId, [{ contactId: juan, amount: 1_000_00 }])

    expect((await db.loans.get(id as Id))?.note).toBe('Dining out')
  })

  it('refuses to split the same expense twice', async () => {
    const txnId = await expense()
    const juan = await createContact('Juan')
    await createSplit(txnId, [{ contactId: juan, amount: 1_000_00 }])

    await expect(
      createSplit(txnId, [{ contactId: juan, amount: 1_000_00 }]),
    ).rejects.toThrow('already split')
    expect(await db.loans.count()).toBe(1)
  })

  it('refuses anything that is not an expense you paid', async () => {
    const income = await expense({ type: 'income' })
    const juan = await createContact('Juan')

    await expect(createSplit(income, [{ contactId: juan, amount: 100_00 }])).rejects.toThrow(
      'Only an expense',
    )
  })

  it('refuses an empty split', async () => {
    const txnId = await expense()
    await expect(createSplit(txnId, [])).rejects.toThrow('at least one person')
  })

  it('refuses when the transaction is gone', async () => {
    const juan = await createContact('Juan')
    await expect(createSplit('nope', [{ contactId: juan, amount: 100_00 }])).rejects.toThrow(
      'no longer exists',
    )
  })
})

describe('removeSplit', () => {
  it('takes the loans back off, leaving the expense alone', async () => {
    const txnId = await expense()
    const juan = await createContact('Juan')
    await createSplit(txnId, [{ contactId: juan, amount: 1_600_00 }])

    await removeSplit(txnId)

    expect(await db.loans.count()).toBe(0)
    expect(await db.transactions.get(txnId)).toBeDefined()
  })

  it('refuses once someone has paid their share', async () => {
    const txnId = await expense()
    const juan = await createContact('Juan')
    const [loanId] = await createSplit(txnId, [{ contactId: juan, amount: 1_600_00 }])
    await db.accounts.add({
      id: 'gcash',
      name: 'GCash',
      type: 'ewallet',
      currency: 'PHP',
      openingBalance: 0,
      color: '#2C6E8A',
      archived: false,
      ...stamp(),
    })
    await recordPayment({
      loanId: loanId as Id,
      amount: 500_00,
      date: '2026-10-12',
      accountId: 'gcash',
    })

    await expect(removeSplit(txnId)).rejects.toThrow('already paid')
    expect(await db.loans.count()).toBe(1)
  })
})
