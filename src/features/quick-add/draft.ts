/**
 * The Quick Add form as data. Kept pure so the rules — what a valid entry is,
 * how the keypad builds an amount, how #tags come out of the note — are
 * testable without mounting the sheet.
 */

import type { Centavos, Id, Transaction, TransactionType } from '@/db/types'
import { parseMoney } from '@/lib/money'
import { toDateOnly } from '@/lib/dates'

export interface Draft {
  type: TransactionType
  /** Raw keypad input: digits with at most one dot and two decimals. */
  amountInput: string
  accountId?: Id
  toAccountId?: Id
  categoryId?: Id
  date: string
  /** As typed, `#tags` and all. */
  note: string
  /** Also create a monthly rule for this entry. */
  repeat: boolean
  /** A newly picked file, waiting to be written. */
  receipt?: { blob: Blob; mime: string; size: number }
  /**
   * A receipt already in the table, when editing. Keeping the two apart is
   * what lets a save tell "leave the photo alone" from "replace it" from
   * "take it off", without rewriting the blob on every edit.
   */
  receiptId?: Id
}

/** True when the draft has a photo on it, stored or newly picked. */
export const hasReceipt = (draft: Draft): boolean =>
  draft.receipt !== undefined || draft.receiptId !== undefined

export function emptyDraft(today: Date = new Date()): Draft {
  return {
    type: 'expense',
    amountInput: '',
    date: toDateOnly(today),
    note: '',
    repeat: false,
  }
}

const MAX_DECIMALS = 2

/**
 * Holds typed or pasted text to the same shape the keypad used to
 * guarantee: digits, at most one dot, at most two decimals, no runaway
 * leading zeros. `pressKey` only ever saw a single key; a real field can
 * be pasted into and edited in the middle.
 */
export function sanitizeAmount(input: string): string {
  const digitsAndDots = input.replace(/[^\d.]/g, '')
  const [whole = '', ...rest] = digitsAndDots.split('.')

  const trimmed = whole.replace(/^0+(?=\d)/, '').slice(0, 9)
  if (rest.length === 0) return trimmed

  // Everything after the first dot is one fraction; a second dot is dropped
  // rather than splitting the number in two.
  const fraction = rest.join('').slice(0, MAX_DECIMALS)
  return `${trimmed === '' ? '0' : trimmed}.${fraction}`
}

export const draftAmount = (draft: Draft): Centavos => parseMoney(draft.amountInput) ?? 0

/** Splits the note into display text and the tags typed into it. */
export function parseNote(raw: string): { note: string; tags: string[] } {
  const tags: string[] = []
  const note = raw
    .replace(/#([\p{L}\p{N}_-]+)/gu, (_match, tag: string) => {
      const lower = tag.toLowerCase()
      if (!tags.includes(lower)) tags.push(lower)
      return ''
    })
    .replace(/\s{2,}/g, ' ')
    .trim()

  return { note, tags }
}

export type DraftProblem =
  | 'amount-required'
  | 'account-required'
  | 'destination-required'
  | 'same-account'
  | 'category-required'

/** The first thing stopping this draft from being saved, if anything is. */
export function validate(draft: Draft): DraftProblem | null {
  if (draftAmount(draft) <= 0) return 'amount-required'
  if (!draft.accountId) return 'account-required'

  if (draft.type === 'transfer') {
    if (!draft.toAccountId) return 'destination-required'
    if (draft.toAccountId === draft.accountId) return 'same-account'
    return null
  }

  if (!draft.categoryId) return 'category-required'
  return null
}

export const PROBLEM_MESSAGE: Readonly<Record<DraftProblem, string>> = {
  'amount-required': 'Enter an amount',
  'account-required': 'Pick an account',
  'destination-required': 'Pick an account to transfer to',
  'same-account': 'Pick two different accounts',
  'category-required': 'Pick a category',
}

export const SAVE_LABEL: Readonly<Record<TransactionType, string>> = {
  expense: 'Save expense',
  income: 'Save income',
  transfer: 'Save transfer',
}

/**
 * The transaction fields this draft stands for. Ids and timestamps are added
 * by the caller that writes it.
 */
export type NewTransaction = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>

export function draftToTransaction(draft: Draft): NewTransaction {
  const problem = validate(draft)
  if (problem) throw new Error(PROBLEM_MESSAGE[problem])

  const { note, tags } = parseNote(draft.note)

  return {
    type: draft.type,
    amount: draftAmount(draft),
    accountId: draft.accountId as Id,
    ...(draft.type === 'transfer' ? { toAccountId: draft.toAccountId as Id } : {}),
    ...(draft.type !== 'transfer' && draft.categoryId ? { categoryId: draft.categoryId } : {}),
    date: draft.date,
    note,
    tags,
    status: 'posted',
  }
}

/**
 * Centavos back to what the keypad would have been holding. Whole amounts
 * lose the trailing `.00` so that a backspace behaves the way it would
 * have done on the way in.
 */
export function amountToInput(amount: Centavos): string {
  const whole = Math.trunc(Math.abs(amount) / 100)
  const fraction = Math.abs(amount) % 100
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`
}

/** Puts the tags back into the note, as they were typed. */
export function toRawNote(note: string, tags: readonly string[]): string {
  return [note, ...tags.map((tag) => `#${tag}`)].filter((part) => part !== '').join(' ')
}

/**
 * The form as it should open for an existing entry — the inverse of
 * `draftToTransaction`.
 *
 * `repeat` is always false: in edit mode the chip is not offered, because
 * an entry's link to a rule is the rule's business and the detail screen
 * has "Make recurring" for setting one up.
 */
export function draftFromTransaction(transaction: Transaction): Draft {
  return {
    type: transaction.type,
    amountInput: amountToInput(transaction.amount),
    accountId: transaction.accountId,
    ...(transaction.toAccountId ? { toAccountId: transaction.toAccountId } : {}),
    ...(transaction.categoryId ? { categoryId: transaction.categoryId } : {}),
    date: transaction.date,
    note: toRawNote(transaction.note, transaction.tags),
    repeat: false,
    ...(transaction.receiptId ? { receiptId: transaction.receiptId } : {}),
  }
}

/**
 * Whether the form has moved from what it opened with — what decides if
 * dismissing it should ask before throwing the edit away.
 *
 * Field by field rather than serialising both and comparing the strings.
 * That is exact and cheap, where a serialised compare depends on key order
 * and cannot see into a `Blob` — every one of them flattens to the same
 * `{}`, so one photo swapped for another of the same type and size would
 * have looked like no change at all.
 */
export function draftChanged(a: Draft, b: Draft): boolean {
  return (
    a.type !== b.type ||
    a.amountInput !== b.amountInput ||
    a.accountId !== b.accountId ||
    a.toAccountId !== b.toAccountId ||
    a.categoryId !== b.categoryId ||
    a.date !== b.date ||
    a.note !== b.note ||
    a.repeat !== b.repeat ||
    a.receiptId !== b.receiptId ||
    // Identity is the test: a newly picked file is always a new object.
    a.receipt !== b.receipt
  )
}

/** Switching type keeps the amount but drops fields that no longer apply. */
export function changeType(draft: Draft, type: TransactionType): Draft {
  if (type === draft.type) return draft

  const next: Draft = { ...draft, type }
  if (type === 'transfer') {
    delete next.categoryId
  } else {
    delete next.toAccountId
    // An expense category makes no sense on income, and the other way round.
    delete next.categoryId
  }
  return next
}
