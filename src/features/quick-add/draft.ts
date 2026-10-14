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
  receipt?: { blob: Blob; mime: string; size: number }
}

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
 * Applies one keypad press. Guards the things a keypad has to guard: a single
 * decimal point, two decimals, no runaway leading zeros.
 */
export function pressKey(input: string, key: string): string {
  if (key === 'backspace') return input.slice(0, -1)

  if (key === '.') {
    if (input.includes('.')) return input
    return input === '' ? '0.' : `${input}.`
  }

  if (!/^\d$/.test(key)) return input

  const [whole = '', fraction] = input.split('.')
  if (fraction !== undefined) {
    if (fraction.length >= MAX_DECIMALS) return input
    return `${whole}.${fraction}${key}`
  }

  // "0" then "5" is 5, not 05 — but "0" then "." keeps the zero.
  if (input === '0') return key
  if (whole.length >= 9) return input
  return input + key
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
