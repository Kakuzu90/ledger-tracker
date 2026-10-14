import { addMonths } from 'date-fns'
import { db, newId, stamp } from '@/db/db'
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
