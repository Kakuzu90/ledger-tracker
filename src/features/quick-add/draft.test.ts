import { describe, expect, it } from 'vitest'
import {
  changeType,
  draftAmount,
  draftToTransaction,
  emptyDraft,
  parseNote,
  pressKey,
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
