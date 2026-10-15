import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/db/types'
import { parseMoney } from '@/lib/money'
import {
  amountToInput,
  changeType,
  draftAmount,
  draftChanged,
  draftFromTransaction,
  draftToTransaction,
  emptyDraft,
  hasReceipt,
  parseNote,
  pressKey,
  toRawNote,
  validate,
  type Draft,
} from './draft'

const TODAY = new Date(2026, 9, 14)

const draft = (over: Partial<Draft> = {}): Draft => ({
  ...emptyDraft(TODAY),
  amountInput: '289',
  accountId: 'gcash',
  categoryId: 'food',
  ...over,
})

describe('pressKey', () => {
  it('builds a number one press at a time', () => {
    expect(['2', '8', '9'].reduce(pressKey, '')).toBe('289')
  })

  it('takes centavos after a decimal point', () => {
    expect(['2', '8', '9', '.', '5', '0'].reduce(pressKey, '')).toBe('289.50')
  })

  it('allows only one decimal point', () => {
    expect(pressKey('289.5', '.')).toBe('289.5')
  })

  it('stops at two decimals', () => {
    expect(pressKey('289.50', '7')).toBe('289.50')
  })

  it('opens with a zero when the point comes first', () => {
    expect(pressKey('', '.')).toBe('0.')
  })

  it('does not leave a leading zero', () => {
    expect(pressKey('0', '5')).toBe('5')
    expect(pressKey('0', '.')).toBe('0.')
  })

  it('deletes from the end', () => {
    expect(pressKey('289.5', 'backspace')).toBe('289.')
    expect(pressKey('', 'backspace')).toBe('')
  })

  it('refuses a number nobody will ever enter', () => {
    expect(pressKey('123456789', '0')).toBe('123456789')
  })

  it('ignores anything that is not a digit', () => {
    expect(pressKey('28', 'x')).toBe('28')
  })
})

describe('draftAmount', () => {
  it('reads the keypad input as centavos', () => {
    expect(draftAmount(draft({ amountInput: '289' }))).toBe(28_900)
    expect(draftAmount(draft({ amountInput: '289.5' }))).toBe(28_950)
  })

  it('is zero for an empty keypad', () => {
    expect(draftAmount(draft({ amountInput: '' }))).toBe(0)
  })
})

describe('parseNote', () => {
  it('lifts #tags out of the note', () => {
    expect(parseNote('Lunch with team #work')).toEqual({
      note: 'Lunch with team',
      tags: ['work'],
    })
  })

  it('takes several tags and lowercases them', () => {
    expect(parseNote('Dinner #Date-Night #food')).toEqual({
      note: 'Dinner',
      tags: ['date-night', 'food'],
    })
  })

  it('does not repeat a tag', () => {
    expect(parseNote('#work and more #work').tags).toEqual(['work'])
  })

  it('tidies the gap a removed tag leaves behind', () => {
    expect(parseNote('Coffee #work with Ana').note).toBe('Coffee with Ana')
  })

  it('copes with a note that is only tags', () => {
    expect(parseNote('#groceries')).toEqual({ note: '', tags: ['groceries'] })
  })

  it('leaves a bare hash alone', () => {
    expect(parseNote('Table #')).toEqual({ note: 'Table #', tags: [] })
  })
})

describe('validate', () => {
  it('passes a complete expense', () => {
    expect(validate(draft())).toBeNull()
  })

  it('wants an amount', () => {
    expect(validate(draft({ amountInput: '' }))).toBe('amount-required')
    expect(validate(draft({ amountInput: '0' }))).toBe('amount-required')
  })

  it('wants an account', () => {
    expect(validate(draft({ accountId: undefined }))).toBe('account-required')
  })

  it('wants a category on an expense', () => {
    expect(validate(draft({ categoryId: undefined }))).toBe('category-required')
  })

  it('wants somewhere to transfer to', () => {
    const transfer = draft({ type: 'transfer', categoryId: undefined })
    expect(validate(transfer)).toBe('destination-required')
  })

  it('refuses a transfer to the same account', () => {
    const transfer = draft({
      type: 'transfer',
      categoryId: undefined,
      toAccountId: 'gcash',
    })
    expect(validate(transfer)).toBe('same-account')
  })

  it('does not ask a transfer for a category', () => {
    const transfer = draft({ type: 'transfer', categoryId: undefined, toAccountId: 'bpi' })
    expect(validate(transfer)).toBeNull()
  })
})

describe('changeType', () => {
  it('keeps the amount', () => {
    expect(changeType(draft({ amountInput: '289' }), 'income').amountInput).toBe('289')
  })

  it('drops a category that belongs to the other side of the ledger', () => {
    // "Food" cannot be an income category.
    expect(changeType(draft(), 'income').categoryId).toBeUndefined()
  })

  it('drops the destination when leaving transfer', () => {
    const transfer = draft({ type: 'transfer', toAccountId: 'bpi' })
    expect(changeType(transfer, 'expense').toAccountId).toBeUndefined()
  })

  it('drops the category when becoming a transfer', () => {
    expect(changeType(draft(), 'transfer').categoryId).toBeUndefined()
  })

  it('leaves the draft alone when the type has not changed', () => {
    const same = draft()
    expect(changeType(same, 'expense')).toBe(same)
  })
})

describe('draftToTransaction', () => {
  it('builds a posted expense with its tags split out', () => {
    const txn = draftToTransaction(draft({ note: 'Lunch with team #work' }))

    expect(txn).toEqual({
      type: 'expense',
      amount: 28_900,
      accountId: 'gcash',
      categoryId: 'food',
      date: '2026-10-14',
      note: 'Lunch with team',
      tags: ['work'],
      status: 'posted',
    })
  })

  it('carries the destination on a transfer and no category', () => {
    const txn = draftToTransaction(
      draft({ type: 'transfer', categoryId: undefined, toAccountId: 'bpi' }),
    )

    expect(txn.toAccountId).toBe('bpi')
    expect(txn.categoryId).toBeUndefined()
  })

  it('refuses to build an invalid draft', () => {
    expect(() => draftToTransaction(draft({ amountInput: '' }))).toThrow('Enter an amount')
  })
})

describe('amountToInput', () => {
  it('drops a trailing .00 so a backspace behaves as it did on the way in', () => {
    expect(amountToInput(1_500_00)).toBe('1500')
  })

  it('keeps centavos, zero-padded', () => {
    expect(amountToInput(1_234_56)).toBe('1234.56')
    expect(amountToInput(10_05)).toBe('10.05')
    expect(amountToInput(50)).toBe('0.50')
  })

  it('reads an amount back as the keypad would have built it', () => {
    for (const centavos of [0, 1, 99, 100, 289_00, 1_234_56, 999_999_99]) {
      expect(parseMoney(amountToInput(centavos))).toBe(centavos)
    }
  })
})

describe('toRawNote', () => {
  it('puts the tags back on the end', () => {
    expect(toRawNote('Lunch with team', ['work'])).toBe('Lunch with team #work')
  })

  it('leaves a note with no tags alone', () => {
    expect(toRawNote('Lunch', [])).toBe('Lunch')
  })

  it('handles a tag-only note without a leading space', () => {
    expect(toRawNote('', ['work', 'food'])).toBe('#work #food')
  })

  it('round-trips through parseNote', () => {
    const { note, tags } = parseNote('Lunch with team #work #food')
    expect(toRawNote(note, tags)).toBe('Lunch with team #work #food')
  })
})

describe('draftFromTransaction', () => {
  const base = {
    id: 't1',
    createdAt: '2026-10-14T00:00:00.000Z',
    updatedAt: '2026-10-14T00:00:00.000Z',
  }

  it('is the inverse of draftToTransaction for an expense', () => {
    const transaction: Transaction = {
      ...base,
      type: 'expense',
      amount: 289_00,
      accountId: 'gcash',
      categoryId: 'food',
      date: '2026-10-14',
      note: 'Lunch with team',
      tags: ['work'],
      status: 'posted',
    }

    const back = draftToTransaction(draftFromTransaction(transaction))
    expect(back).toEqual({
      type: 'expense',
      amount: 289_00,
      accountId: 'gcash',
      categoryId: 'food',
      date: '2026-10-14',
      note: 'Lunch with team',
      tags: ['work'],
      status: 'posted',
    })
  })

  it('carries a transfer’s destination and leaves off the category', () => {
    const draft = draftFromTransaction({
      ...base,
      type: 'transfer',
      amount: 5_000_00,
      accountId: 'bpi',
      toAccountId: 'gcash',
      date: '2026-10-14',
      note: '',
      tags: [],
      status: 'posted',
    })

    expect(draft.toAccountId).toBe('gcash')
    expect(draft.categoryId).toBeUndefined()
    expect(validate(draft)).toBeNull()
  })

  it('points at the stored receipt rather than carrying a new file', () => {
    const draft = draftFromTransaction({
      ...base,
      type: 'expense',
      amount: 100_00,
      accountId: 'gcash',
      categoryId: 'food',
      date: '2026-10-14',
      note: '',
      tags: [],
      receiptId: 'r1',
      status: 'posted',
    })

    expect(draft.receiptId).toBe('r1')
    expect(draft.receipt).toBeUndefined()
    expect(hasReceipt(draft)).toBe(true)
  })

  it('never opens with Repeat on — the rule is not the entry’s to set', () => {
    const draft = draftFromTransaction({
      ...base,
      type: 'expense',
      amount: 149_00,
      accountId: 'gcash',
      categoryId: 'bills',
      date: '2026-10-14',
      note: 'Spotify',
      tags: [],
      recurringId: 'rule-1',
      status: 'pending',
    })

    expect(draft.repeat).toBe(false)
  })
})

describe('draftChanged', () => {
  const source: Transaction = {
    id: 't1',
    type: 'expense',
    amount: 289_00,
    accountId: 'gcash',
    categoryId: 'food',
    date: '2026-10-14',
    note: 'Lunch',
    tags: [],
    status: 'posted',
    createdAt: '2026-10-14T00:00:00.000Z',
    updatedAt: '2026-10-14T00:00:00.000Z',
  }

  it('is false for the draft it opened with', () => {
    const draft = draftFromTransaction(source)
    expect(draftChanged(draft, draftFromTransaction(source))).toBe(false)
  })

  it('notices an edited field', () => {
    const draft = draftFromTransaction(source)
    expect(draftChanged({ ...draft, amountInput: '300' }, draft)).toBe(true)
    expect(draftChanged({ ...draft, note: 'Dinner' }, draft)).toBe(true)
    expect(draftChanged({ ...draft, categoryId: 'transport' }, draft)).toBe(true)
  })

  it('notices a photo taken off', () => {
    const withPhoto = draftFromTransaction({ ...source, receiptId: 'r1' })
    expect(draftChanged({ ...withPhoto, receiptId: undefined }, withPhoto)).toBe(true)
  })

  it('notices one photo swapped for another of the same type and size', () => {
    const draft = draftFromTransaction(source)
    const first = { ...draft, receipt: { blob: new Blob(['a']), mime: 'image/jpeg', size: 1 } }
    const second = { ...draft, receipt: { blob: new Blob(['b']), mime: 'image/jpeg', size: 1 } }

    // Every Blob serialises to the same `{}`, so with the type and size
    // matching these two are indistinguishable to a deep compare.
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    expect(draftChanged(second, first)).toBe(true)
  })
})
