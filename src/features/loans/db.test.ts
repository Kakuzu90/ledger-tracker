import { beforeEach, describe, expect, it } from 'vitest'
import { db, newId, stamp } from '@/db/db'
import type { Account, Id } from '@/db/types'
import { accountBalance } from '@/lib/balances'
import { outstanding } from '@/lib/loans'
import {
  createContact,
  createLoan,
  deleteLoan,
  deletePayment,
  recordPayment,
  reopenLoans,
  settleLoans,
  type LoanDraft,
} from './db'

const reset = async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
}

const account = async (name: string, openingBalance = 10_000_00): Promise<Id> => {
  const row: Account = {
    id: newId(),
    name,
    type: 'bank',
    currency: 'PHP',
    openingBalance,
    color: '#1D4E89',
    archived: false,
    ...stamp(),
  }
  await db.accounts.add(row)
  return row.id
}

const balance = async (id: Id): Promise<number> =>
  accountBalance((await db.accounts.get(id)) as Account, await db.transactions.toArray())

const draft = (over: Partial<LoanDraft> = {}): LoanDraft => ({
  kind: 'personal',
  direction: 'lent',
  principal: 3_000_00,
  startDate: '2026-10-08',
  note: 'Phone repair',
  ...over,
})

beforeEach(reset)

describe('createContact', () => {
  it('stores a trimmed name', async () => {
    const id = await createContact('  Juan Dela Cruz ')
    expect((await db.contacts.get(id))?.name).toBe('Juan Dela Cruz')
  })

  it('refuses a blank name', async () => {
    await expect(createContact('   ')).rejects.toThrow('name')
  })
})

describe('createLoan', () => {
  it('writes the loan open, with timestamps', async () => {
    const contactId = await createContact('Juan')
    const id = await createLoan(draft({ contactId }))
    const loan = await db.loans.get(id)

    expect(loan?.status).toBe('open')
    expect(loan?.principal).toBe(3_000_00)
    expect(loan?.createdAt).toBe(loan?.updatedAt)
  })

  it('takes the money out of the account when asked', async () => {
    const contactId = await createContact('Juan')
    const accountId = await account('BPI')

    await createLoan(draft({ contactId, accountId, moveMoney: true }))

    const [movement] = await db.transactions.toArray()
    expect(movement?.type).toBe('expense')
    expect(movement?.amount).toBe(3_000_00)
    expect(await balance(accountId)).toBe(7_000_00)
  })

  it('puts money in when you are the one borrowing', async () => {
    const contactId = await createContact('Ken')
    const accountId = await account('GCash')

    await createLoan(
      draft({ contactId, accountId, direction: 'borrowed', moveMoney: true, principal: 4_000_00 }),
    )

    expect((await db.transactions.toArray())[0]?.type).toBe('income')
    expect(await balance(accountId)).toBe(14_000_00)
  })

  it('moves nothing when the cash changed hands outside the app', async () => {
    const contactId = await createContact('Juan')
    const accountId = await account('BPI')

    await createLoan(draft({ contactId, accountId, moveMoney: false }))

    expect(await db.transactions.count()).toBe(0)
    expect(await balance(accountId)).toBe(10_000_00)
  })

  it('books nothing for a formal loan — the bank paid the dealer', async () => {
    const accountId = await account('BPI')
    await createLoan(
      draft({
        kind: 'formal',
        direction: 'borrowed',
        lender: 'BDO',
        principal: 650_000_00,
        ratePct: 9.5,
        termMonths: 60,
        note: 'Car loan',
        accountId,
        moveMoney: true,
      }),
    )

    expect(await db.transactions.count()).toBe(0)
    expect(await balance(accountId)).toBe(10_000_00)
  })

  it('insists on an amount, a person, and a lender', async () => {
    await expect(createLoan(draft({ principal: 0 }))).rejects.toThrow('how much')
    await expect(createLoan(draft())).rejects.toThrow('who it is with')
    await expect(createLoan(draft({ kind: 'formal' }))).rejects.toThrow('lender')
  })
})

describe('recordPayment', () => {
  const lentLoan = async () => {
    const contactId = await createContact('Juan')
    const from = await account('BPI')
    const loanId = await createLoan(draft({ contactId, accountId: from, moveMoney: true }))
    return { loanId, from }
  }

  it('records a partial repayment and leaves the loan open', async () => {
    const { loanId, from } = await lentLoan()
    const into = await account('GCash', 0)

    await recordPayment({ loanId, amount: 1_000_00, date: '2026-10-12', accountId: into })

    const loan = await db.loans.get(loanId)
    const payments = await db.loanPayments.toArray()
    expect(loan?.status).toBe('open')
    expect(outstanding(loan!, payments)).toBe(2_000_00)
    // The money came back in, so the lending account is still down 3,000.
    expect(await balance(into)).toBe(1_000_00)
    expect(await balance(from)).toBe(7_000_00)
  })

  it('mirrors the payment into a linked transaction', async () => {
    const { loanId } = await lentLoan()
    const into = await account('GCash', 0)

    const paymentId = await recordPayment({
      loanId,
      amount: 1_000_00,
      date: '2026-10-12',
      accountId: into,
    })

    const payment = await db.loanPayments.get(paymentId)
    const linked = await db.transactions.get(payment!.transactionId)
    expect(linked?.type).toBe('income')
    expect(linked?.loanId).toBe(loanId)
    expect(linked?.note).toBe('Repayment · Phone repair')
    expect(linked?.date).toBe('2026-10-12')
  })

  it('settles the loan once the last peso is in', async () => {
    const { loanId } = await lentLoan()
    const into = await account('GCash', 0)

    await recordPayment({ loanId, amount: 1_000_00, date: '2026-10-12', accountId: into })
    await recordPayment({ loanId, amount: 2_000_00, date: '2026-10-13', accountId: into })

    expect((await db.loans.get(loanId))?.status).toBe('settled')
  })

  it('pays out rather than in when you are the borrower', async () => {
    const contactId = await createContact('Ken')
    const from = await account('GCash')
    const loanId = await createLoan(
      draft({ contactId, direction: 'borrowed', accountId: from, principal: 4_000_00 }),
    )

    await recordPayment({ loanId, amount: 1_500_00, date: '2026-10-12', accountId: from })

    expect((await db.transactions.toArray())[0]?.type).toBe('expense')
    expect(await balance(from)).toBe(8_500_00)
  })

  it('refuses more than a personal loan is owed', async () => {
    const { loanId } = await lentLoan()
    const into = await account('GCash', 0)

    await expect(
      recordPayment({ loanId, amount: 4_000_00, date: '2026-10-12', accountId: into }),
    ).rejects.toThrow('more than the ₱3,000 left')
    expect(await db.loanPayments.count()).toBe(0)
  })

  it('lets a formal loan take more than its principal, because of interest', async () => {
    const from = await account('BPI', 1_000_000_00)
    const loanId = await createLoan(
      draft({
        kind: 'formal',
        direction: 'borrowed',
        lender: 'BDO',
        principal: 100_000_00,
        ratePct: 9.5,
        termMonths: 12,
        note: 'Car loan',
        accountId: from,
      }),
    )

    await recordPayment({
      loanId,
      amount: 120_000_00,
      date: '2026-10-12',
      accountId: from,
      installmentNo: 1,
    })

    expect((await db.loanPayments.toArray())[0]?.installmentNo).toBe(1)
    // Interest is not principal, so the loan does not close itself.
    expect((await db.loans.get(loanId))?.status).toBe('open')
  })

  it('insists on an amount', async () => {
    const { loanId, from } = await lentLoan()
    await expect(
      recordPayment({ loanId, amount: 0, date: '2026-10-12', accountId: from }),
    ).rejects.toThrow('how much')
  })
})

describe('deletePayment', () => {
  it('takes back the payment, its transaction and the settled flag', async () => {
    const contactId = await createContact('Juan')
    const from = await account('BPI')
    const loanId = await createLoan(draft({ contactId, accountId: from }))
    const paymentId = await recordPayment({
      loanId,
      amount: 3_000_00,
      date: '2026-10-12',
      accountId: from,
    })
    expect((await db.loans.get(loanId))?.status).toBe('settled')

    await deletePayment(paymentId)

    expect(await db.loanPayments.count()).toBe(0)
    expect(await db.transactions.count()).toBe(0)
    expect((await db.loans.get(loanId))?.status).toBe('open')
    expect(await balance(from)).toBe(10_000_00)
  })

  it('does nothing for a payment that is already gone', async () => {
    await expect(deletePayment('nope')).resolves.toBeUndefined()
  })
})

describe('settleLoans', () => {
  it('closes open loans and hands back what it closed', async () => {
    const contactId = await createContact('Juan')
    const a = await createLoan(draft({ contactId }))
    const b = await createLoan(draft({ contactId, note: 'Concert tickets' }))

    const closed = await settleLoans([a, b])

    expect(closed).toEqual([a, b])
    expect((await db.loans.get(a))?.status).toBe('settled')
    // Settling records no money — it is for debts written off.
    expect(await db.transactions.count()).toBe(0)
  })

  it('skips one that is already settled, so undo puts back only what changed', async () => {
    const contactId = await createContact('Juan')
    const a = await createLoan(draft({ contactId }))
    await settleLoans([a])

    expect(await settleLoans([a])).toEqual([])
  })

  it('reopens what it closed', async () => {
    const contactId = await createContact('Juan')
    const a = await createLoan(draft({ contactId }))

    await reopenLoans(await settleLoans([a]))

    expect((await db.loans.get(a))?.status).toBe('open')
  })
})

describe('deleteLoan', () => {
  it('removes the loan and the money it moved', async () => {
    const contactId = await createContact('Juan')
    const from = await account('BPI')
    const id = await createLoan(draft({ contactId, accountId: from, moveMoney: true }))

    await deleteLoan(id)

    expect(await db.loans.get(id)).toBeUndefined()
    expect(await db.transactions.count()).toBe(0)
    expect(await balance(from)).toBe(10_000_00)
  })

  it('refuses once a payment has been recorded against it', async () => {
    const contactId = await createContact('Juan')
    const from = await account('BPI')
    const id = await createLoan(draft({ contactId, accountId: from }))
    await recordPayment({ loanId: id, amount: 500_00, date: '2026-10-12', accountId: from })

    await expect(deleteLoan(id)).rejects.toThrow('Settle it instead')
    expect(await db.loans.get(id)).toBeDefined()
  })
})
