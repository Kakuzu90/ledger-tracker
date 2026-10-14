import { beforeEach, describe, expect, it } from 'vitest'
import { db, newId, stamp } from '@/db/db'
import type { Transaction } from '@/db/types'
import {
  createAccount,
  deleteAccount,
  normalizeDraft,
  setArchived,
  updateAccount,
  type AccountDraft,
} from './db'

const reset = async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
}

const draft = (over: Partial<AccountDraft> = {}): AccountDraft => ({
  name: 'BPI Savings',
  type: 'bank',
  color: '#1D4E89',
  openingBalance: 10_000_00,
  ...over,
})

const txn = (over: Partial<Transaction> & Pick<Transaction, 'accountId'>): Transaction => ({
  id: newId(),
  type: 'expense',
  amount: 100_00,
  date: '2026-10-14',
  note: '',
  tags: [],
  status: 'posted',
  ...stamp(),
  ...over,
})

beforeEach(reset)

describe('normalizeDraft', () => {
  it('stores a card balance as what is owed, negative', () => {
    const card = normalizeDraft(draft({ type: 'credit', openingBalance: 20_480_00 }))
    expect(card.openingBalance).toBe(-20_480_00)
  })

  it('does not flip an already-negative card balance back', () => {
    const card = normalizeDraft(draft({ type: 'credit', openingBalance: -20_480_00 }))
    expect(card.openingBalance).toBe(-20_480_00)
  })

  it('leaves a cash balance alone', () => {
    expect(normalizeDraft(draft({ openingBalance: 3_250_00 })).openingBalance).toBe(3_250_00)
  })

  it('drops card-only fields from a non-card', () => {
    const bank = normalizeDraft(
      draft({ type: 'bank', creditLimit: 60_000_00, statementDay: 5, dueDay: 25 }),
    )
    expect(bank.creditLimit).toBeUndefined()
    expect(bank.statementDay).toBeUndefined()
    expect(bank.dueDay).toBeUndefined()
  })
})

describe('createAccount', () => {
  it('writes an account with an id, currency and timestamps', async () => {
    const id = await createAccount(draft())
    const account = await db.accounts.get(id)

    expect(account?.name).toBe('BPI Savings')
    expect(account?.currency).toBe('PHP')
    expect(account?.archived).toBe(false)
    expect(account?.createdAt).toBe(account?.updatedAt)
  })

  it('keeps the card fields on a card', async () => {
    const id = await createAccount(
      draft({
        name: 'BPI Visa',
        type: 'credit',
        openingBalance: 20_480_00,
        creditLimit: 60_000_00,
        statementDay: 5,
        dueDay: 25,
      }),
    )
    const card = await db.accounts.get(id)

    expect(card?.openingBalance).toBe(-20_480_00)
    expect(card?.creditLimit).toBe(60_000_00)
    expect(card?.dueDay).toBe(25)
  })
})

describe('updateAccount', () => {
  it('saves the changes', async () => {
    const id = await createAccount(draft())
    await updateAccount(id, draft({ name: 'BPI Main', openingBalance: 12_000_00 }))

    const account = await db.accounts.get(id)
    expect(account?.name).toBe('BPI Main')
    expect(account?.openingBalance).toBe(12_000_00)
  })

  it('clears the card fields when a card becomes a bank account', async () => {
    const id = await createAccount(
      draft({ type: 'credit', creditLimit: 60_000_00, statementDay: 5, dueDay: 25 }),
    )

    await updateAccount(id, draft({ type: 'bank' }))

    const account = await db.accounts.get(id)
    // A stale limit on a bank account would show a credit bar that means nothing.
    expect(account?.creditLimit).toBeUndefined()
    expect(account?.statementDay).toBeUndefined()
  })
})

describe('setArchived', () => {
  it('archives and brings back', async () => {
    const id = await createAccount(draft())

    await setArchived(id, true)
    expect((await db.accounts.get(id))?.archived).toBe(true)

    await setArchived(id, false)
    expect((await db.accounts.get(id))?.archived).toBe(false)
  })

  it('keeps the transactions that used it', async () => {
    const id = await createAccount(draft())
    await db.transactions.add(txn({ accountId: id }))

    await setArchived(id, true)

    expect(await db.transactions.count()).toBe(1)
  })
})

describe('deleteAccount', () => {
  it('removes an account nothing refers to', async () => {
    const id = await createAccount(draft())
    await deleteAccount(id)
    expect(await db.accounts.get(id)).toBeUndefined()
  })

  it('refuses while transactions still point at it', async () => {
    const id = await createAccount(draft())
    await db.transactions.add(txn({ accountId: id }))

    // Deleting would strand the transaction against an account that is gone.
    await expect(deleteAccount(id)).rejects.toThrow('Archive it instead')
    expect(await db.accounts.get(id)).toBeDefined()
  })

  it('counts a transfer into the account as a use of it', async () => {
    const from = await createAccount(draft({ name: 'From' }))
    const to = await createAccount(draft({ name: 'To' }))
    await db.transactions.add(
      txn({ type: 'transfer', accountId: from, toAccountId: to, amount: 500_00 }),
    )

    await expect(deleteAccount(to)).rejects.toThrow('1 transaction uses it')
  })
})
