/**
 * Turning one expense into loans. The expense itself is left alone: the money
 * really did leave your account, and each person's share comes back as a
 * repayment later. So a split loan books no transaction of its own — that
 * would count the same peso twice.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId, stamp } from '@/db/db'
import type { Account, Category, Centavos, Contact, Id, Loan, Transaction } from '@/db/types'
import { categoryPath, buildLookups } from '@/features/transactions/describe'

export interface SplitData {
  /** null once the transaction is gone. */
  transaction: Transaction | null
  contacts: Contact[]
  account?: Account
  category?: Category
  categoryPath?: string
  /** Loans this transaction has already been split into. */
  existing: Loan[]
  /** Which of those already carry a repayment, so cannot be unpicked. */
  paidLoanIds: Id[]
}

export function useSplitData(transactionId: Id | undefined): SplitData | undefined {
  return useLiveQuery(async () => {
    if (!transactionId) return { transaction: null, contacts: [], existing: [], paidLoanIds: [] }

    const transaction = await db.transactions.get(transactionId)
    if (!transaction) return { transaction: null, contacts: [], existing: [], paidLoanIds: [] }

    const [contacts, categories, accounts, existing] = await Promise.all([
      db.contacts.toArray(),
      db.categories.toArray(),
      db.accounts.toArray(),
      db.loans.where('splitFromTxnId').equals(transactionId).toArray(),
    ])

    const payments = await db.loanPayments.toArray()
    const splitIds = new Set(existing.map((loan) => loan.id))
    const lookups = buildLookups(categories, accounts)

    return {
      transaction,
      contacts: contacts.sort((a, b) => a.name.localeCompare(b.name)),
      account: lookups.accountById.get(transaction.accountId),
      category: transaction.categoryId
        ? lookups.categoryById.get(transaction.categoryId)
        : undefined,
      categoryPath: categoryPath(transaction.categoryId, lookups),
      existing,
      paidLoanIds: [
        ...new Set(
          payments.filter((p) => splitIds.has(p.loanId)).map((p) => p.loanId),
        ),
      ],
    }
  }, [transactionId])
}

export interface SplitShareInput {
  contactId: Id
  amount: Centavos
}

/**
 * Creates one loan per person. Each is an ordinary personal loan afterwards:
 * it shows up under that contact and is repaid the same way.
 */
export async function createSplit(
  transactionId: Id,
  shares: readonly SplitShareInput[],
): Promise<Id[]> {
  if (shares.length === 0) throw new Error('Pick at least one person to owe you')

  return db.transaction('rw', db.transactions, db.loans, db.categories, async () => {
    const transaction = await db.transactions.get(transactionId)
    if (!transaction) throw new Error('That transaction no longer exists')
    if (transaction.type !== 'expense') {
      throw new Error('Only an expense you paid can be split')
    }

    const already = await db.loans.where('splitFromTxnId').equals(transactionId).count()
    if (already > 0) throw new Error('This expense is already split')

    const category = transaction.categoryId
      ? await db.categories.get(transaction.categoryId)
      : undefined
    const note = transaction.note || category?.name || 'Shared expense'

    const loans: Loan[] = shares.map((share) => ({
      id: newId(),
      kind: 'personal',
      direction: 'lent',
      contactId: share.contactId,
      principal: share.amount,
      startDate: transaction.date,
      note,
      splitFromTxnId: transaction.id,
      status: 'open',
      ...stamp(),
    }))

    await db.loans.bulkAdd(loans)
    return loans.map((loan) => loan.id)
  })
}

/** Unpicks a split, so the expense can be divided again. */
export async function removeSplit(transactionId: Id): Promise<void> {
  await db.transaction('rw', db.loans, db.loanPayments, async () => {
    const loans = await db.loans.where('splitFromTxnId').equals(transactionId).toArray()
    const ids = loans.map((loan) => loan.id)

    const paid = await db.loanPayments.where('loanId').anyOf(ids).count()
    if (paid > 0) {
      throw new Error('Someone has already paid their share — settle those loans instead')
    }

    await db.loans.bulkDelete(ids)
  })
}
