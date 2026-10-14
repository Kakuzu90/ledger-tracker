import { addMonths } from 'date-fns'
import { db, newId, stamp, touch } from '@/db/db'
import type { Id, Recurring } from '@/db/types'
import { toDateOnly } from '@/lib/dates'
import { draftToTransaction, type Draft } from './draft'

/**
 * Writes the draft: the transaction, its receipt, and a monthly rule when
 * "Repeat" is on — all in one Dexie transaction, so a half-saved entry is
 * never left behind.
 */
export async function saveDraft(draft: Draft): Promise<Id> {
  const fields = draftToTransaction(draft)
  const transactionId = newId()

  await db.transaction('rw', db.transactions, db.receipts, db.recurring, async () => {
    let receiptId: Id | undefined
    if (draft.receipt) {
      receiptId = newId()
      await db.receipts.add({ id: receiptId, ...draft.receipt, ...stamp() })
    }

    await db.transactions.add({
      id: transactionId,
      ...fields,
      ...(receiptId ? { receiptId } : {}),
      ...stamp(),
    })

    if (draft.repeat) {
      const rule: Recurring = {
        id: newId(),
        template: {
          type: fields.type,
          amount: fields.amount,
          accountId: fields.accountId,
          note: fields.note,
          tags: fields.tags,
          ...(fields.toAccountId ? { toAccountId: fields.toAccountId } : {}),
          ...(fields.categoryId ? { categoryId: fields.categoryId } : {}),
        },
        freq: 'monthly',
        interval: 1,
        startDate: fields.date,
        // Asks before adding: a rule made in passing should not spend money
        // on its own.
        nextDate: toDateOnly(addMonths(new Date(fields.date), 1)),
        mode: 'confirm',
        ...stamp(),
      }
      await db.recurring.add(rule)
    }
  })

  return transactionId
}

/**
 * Saves an edit to an existing entry.
 *
 * What is deliberately left alone: `status`, so editing a pending recurring
 * entry does not quietly post it; `recurringId` and `loanId`, which say
 * where the entry came from and are not the form's to change; and
 * `createdAt`.
 *
 * Two edits are refused outright, both because the entry is not really
 * standing on its own:
 *
 * - A loan repayment. Its amount, date and account are one half of a pair
 *   with a `loanPayments` row, and changing one side here would silently
 *   alter what somebody owes. `deleteTransaction` refuses these for the
 *   same reason, and points at the same place.
 * - Changing the *type* of an expense that has been split. The loans a
 *   split created are snapshots that stand on their own afterwards, so the
 *   amount may move freely — but `createSplit` only ever makes them from an
 *   expense, and turning one into income would leave the shares attached to
 *   something that could not have produced them.
 */
export async function updateDraft(id: Id, draft: Draft): Promise<void> {
  const fields = draftToTransaction(draft)

  await db.transaction(
    'rw',
    db.transactions,
    db.receipts,
    db.loanPayments,
    db.loans,
    async () => {
      const existing = await db.transactions.get(id)
      if (!existing) throw new Error('That transaction no longer exists')

      const payment = await db.loanPayments.where('transactionId').equals(id).first()
      if (payment) {
        throw new Error('Edit this from the loan instead — it is a loan payment')
      }

      if (fields.type !== existing.type) {
        const splits = await db.loans.where('splitFromTxnId').equals(id).count()
        if (splits > 0) {
          throw new Error('Remove the split before changing what kind of entry this is')
        }
      }

      /*
       * Three receipt outcomes, which is why the draft keeps a new file and
       * a stored id in separate fields: a new blob replaces whatever was
       * there, a surviving id means leave it alone, and neither means the
       * photo was taken off and its row should go with it.
       */
      let receiptId = draft.receiptId
      if (draft.receipt) {
        if (existing.receiptId) await db.receipts.delete(existing.receiptId)
        receiptId = newId()
        await db.receipts.add({ id: receiptId, ...draft.receipt, ...stamp() })
      } else if (existing.receiptId && receiptId === undefined) {
        await db.receipts.delete(existing.receiptId)
      }

      // Written as a complete patch rather than a spread: an entry that
      // stops being a transfer has to *lose* `toAccountId`, and a key that
      // is simply absent would leave the old value in place.
      await db.transactions.update(id, {
        type: fields.type,
        amount: fields.amount,
        accountId: fields.accountId,
        toAccountId: fields.toAccountId,
        categoryId: fields.categoryId,
        date: fields.date,
        note: fields.note,
        tags: fields.tags,
        receiptId,
        ...touch(),
      })
    },
  )
}
