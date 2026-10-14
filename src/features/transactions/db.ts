import { db, newId, stamp, touch } from '@/db/db'
import type { Id, Receipt, Recurring, Transaction } from '@/db/types'
import { advanceDate, advanceRule } from '@/lib/recurring'
import { toDateOnly } from '@/lib/dates'

/**
 * Everything a delete took away, so Undo can put it back exactly. The
 * receipt travels with the transaction: deleting one and orphaning the other
 * would leave a blob nothing points at.
 */
export interface DeletedTransaction {
  transaction: Transaction
  receipt?: Receipt
  /** The loan payment this transaction settled, if it was one. */
  loanPaymentId?: Id
}

export async function getTransaction(id: Id): Promise<Transaction | undefined> {
  return db.transactions.get(id)
}

export async function getReceipt(id: Id | undefined): Promise<Receipt | undefined> {
  return id === undefined ? undefined : db.receipts.get(id)
}

/**
 * Removes a transaction and hands back what it took, for Undo.
 *
 * A transaction that carries a loan payment is refused: deleting it would
 * silently change what someone owes. The loan screen handles those.
 */
export async function deleteTransaction(id: Id): Promise<DeletedTransaction> {
  return db.transaction('rw', db.transactions, db.receipts, db.loanPayments, async () => {
    const transaction = await db.transactions.get(id)
    if (!transaction) throw new Error('That transaction is already gone')

    const payment = await db.loanPayments.where('transactionId').equals(id).first()
    if (payment) {
      throw new Error('Delete this from the loan instead — it is a loan payment')
    }

    const receipt = await getReceipt(transaction.receiptId)

    await db.transactions.delete(id)
    if (receipt) await db.receipts.delete(receipt.id)

    return { transaction, ...(receipt ? { receipt } : {}) }
  })
}

/** Puts back exactly what `deleteTransaction` removed. */
export async function restoreTransaction(deleted: DeletedTransaction): Promise<void> {
  await db.transaction('rw', db.transactions, db.receipts, async () => {
    if (deleted.receipt) await db.receipts.put(deleted.receipt)
    await db.transactions.put(deleted.transaction)
  })
}

/**
 * Copies a transaction to today. The receipt is not copied — it is a photo
 * of one purchase, and the copy is a different one.
 */
export async function duplicateTransaction(id: Id, today = new Date()): Promise<Id> {
  const source = await db.transactions.get(id)
  if (!source) throw new Error('That transaction no longer exists')

  const copy: Transaction = {
    ...source,
    id: newId(),
    date: toDateOnly(today),
    status: 'posted',
    ...stamp(),
  }
  delete copy.receiptId
  // A copy stands on its own: it is neither the recurring entry that made
  // the original nor part of the loan it belonged to.
  delete copy.recurringId
  delete copy.loanId

  await db.transactions.add(copy)
  return copy.id
}

/** Replaces or removes the photo attached to a transaction. */
export async function setReceipt(
  transactionId: Id,
  file: { blob: Blob; mime: string; size: number } | null,
): Promise<void> {
  await db.transaction('rw', db.transactions, db.receipts, async () => {
    const transaction = await db.transactions.get(transactionId)
    if (!transaction) return

    if (transaction.receiptId) await db.receipts.delete(transaction.receiptId)

    if (file === null) {
      await db.transactions.update(transactionId, { receiptId: undefined, ...touch() })
      return
    }

    const receiptId = newId()
    await db.receipts.add({ id: receiptId, ...file, ...stamp() })
    await db.transactions.update(transactionId, { receiptId, ...touch() })
  })
}

/** Turns an existing transaction into a monthly rule. */
export async function makeRecurring(transactionId: Id): Promise<Id> {
  const source = await db.transactions.get(transactionId)
  if (!source) throw new Error('That transaction no longer exists')

  const rule: Recurring = {
    id: newId(),
    template: {
      type: source.type,
      amount: source.amount,
      accountId: source.accountId,
      note: source.note,
      tags: source.tags,
      ...(source.toAccountId ? { toAccountId: source.toAccountId } : {}),
      ...(source.categoryId ? { categoryId: source.categoryId } : {}),
    },
    freq: 'monthly',
    interval: 1,
    startDate: source.date,
    // Starts next month: this month's entry already exists.
    nextDate: advanceDate(source.date, 'monthly', 1),
    mode: 'confirm',
    ...stamp(),
  }

  await db.recurring.add(rule)
  await db.transactions.update(transactionId, { recurringId: rule.id, ...touch() })
  return rule.id
}

/**
 * Accepts a pending recurring entry: the transaction posts and the rule
 * moves to its next date.
 */
export async function confirmPending(transactionId: Id): Promise<void> {
  await db.transaction('rw', db.transactions, db.recurring, async () => {
    const pending = await db.transactions.get(transactionId)
    if (!pending) return

    await db.transactions.update(transactionId, { status: 'posted', ...touch() })

    const rule = pending.recurringId ? await db.recurring.get(pending.recurringId) : undefined
    if (rule) await db.recurring.update(rule.id, { ...advanceRule(rule), ...touch() })
  })
}

/** Declines this occurrence: the entry goes, the rule still moves on. */
export async function skipPending(transactionId: Id): Promise<void> {
  await db.transaction('rw', db.transactions, db.recurring, async () => {
    const pending = await db.transactions.get(transactionId)
    if (!pending) return

    await db.transactions.delete(transactionId)

    const rule = pending.recurringId ? await db.recurring.get(pending.recurringId) : undefined
    if (rule) await db.recurring.update(rule.id, { ...advanceRule(rule), ...touch() })
  })
}
