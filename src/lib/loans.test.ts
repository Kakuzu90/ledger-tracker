import { describe, expect, it } from 'vitest'
import {
  byContact,
  fromAnnualRate,
  isOverdue,
  isSettled,
  loanTotals,
  outstanding,
  rateLabel,
  repaid,
  repaidShare,
  toAnnualRate,
} from './loans'
import type { Loan, LoanPayment } from '@/db/types'

const stamps = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }

const loan = (over: Partial<Loan> & Pick<Loan, 'id'>): Loan => ({
  kind: 'personal',
  direction: 'lent',
  principal: 0,
  startDate: '2026-09-02',
  note: '',
  status: 'open',
  ...stamps,
  ...over,
})

const payment = (over: Partial<LoanPayment> & Pick<LoanPayment, 'id' | 'loanId'>): LoanPayment => ({
  amount: 0,
  date: '2026-10-05',
  transactionId: 'txn',
  ...stamps,
  ...over,
})

describe('repaid / outstanding', () => {
  const tickets = loan({ id: 'tickets', principal: 3_000_00 })
  const payments = [
    payment({ id: 'p1', loanId: 'tickets', amount: 600_00 }),
    payment({ id: 'p2', loanId: 'tickets', amount: 400_00 }),
    payment({ id: 'p3', loanId: 'other', amount: 9_000_00 }),
  ]

  it('adds up only this loan’s payments', () => {
    expect(repaid('tickets', payments)).toBe(1_000_00)
  })

  it('leaves the rest outstanding', () => {
    expect(outstanding(tickets, payments)).toBe(2_000_00)
  })

  it('does not go negative when someone overpays', () => {
    expect(outstanding(loan({ id: 'tickets', principal: 500_00 }), payments)).toBe(0)
  })

  it('is the whole principal with no payments', () => {
    expect(outstanding(tickets, [])).toBe(3_000_00)
  })
})

describe('repaidShare', () => {
  it('is the repaid fraction of the principal', () => {
    expect(repaidShare(loan({ id: 'l', principal: 3_000_00 }), [
      payment({ id: 'p', loanId: 'l', amount: 1_000_00 }),
    ])).toBeCloseTo(1 / 3)
  })

  it('treats a zero-principal loan as done', () => {
    expect(repaidShare(loan({ id: 'l', principal: 0 }), [])).toBe(1)
  })
})

describe('isSettled', () => {
  it('is true once the principal is covered', () => {
    expect(
      isSettled(loan({ id: 'l', principal: 800_00 }), [
        payment({ id: 'p', loanId: 'l', amount: 800_00 }),
      ]),
    ).toBe(true)
  })

  it('respects an explicitly settled loan', () => {
    expect(isSettled(loan({ id: 'l', principal: 800_00, status: 'settled' }), [])).toBe(true)
  })
})

describe('isOverdue', () => {
  const today = '2026-10-14'

  it('is true past the due date while money is still owed', () => {
    expect(isOverdue(loan({ id: 'l', principal: 3_000_00, dueDate: '2026-10-11' }), [], today)).toBe(
      true,
    )
  })

  it('is false on the due date itself', () => {
    expect(isOverdue(loan({ id: 'l', principal: 3_000_00, dueDate: today }), [], today)).toBe(false)
  })

  it('is false once settled, however late', () => {
    const paid = [payment({ id: 'p', loanId: 'l', amount: 3_000_00 })]
    expect(
      isOverdue(loan({ id: 'l', principal: 3_000_00, dueDate: '2026-01-01' }), paid, today),
    ).toBe(false)
  })

  it('is false without a due date', () => {
    expect(isOverdue(loan({ id: 'l', principal: 3_500_00 }), [], today)).toBe(false)
  })
})

describe('loanTotals', () => {
  const loans = [
    loan({ id: 'juan-1', principal: 3_000_00, contactId: 'juan' }),
    loan({ id: 'juan-2', principal: 3_500_00, contactId: 'juan' }),
    loan({ id: 'maria', principal: 4_500_00, contactId: 'maria' }),
    loan({ id: 'ana', principal: 2_500_00, contactId: 'ana' }),
    loan({ id: 'ken', principal: 4_000_00, contactId: 'ken', direction: 'borrowed' }),
    loan({ id: 'settled', principal: 800_00, contactId: 'juan', status: 'settled' }),
    loan({ id: 'car', kind: 'formal', direction: 'borrowed', principal: 650_000_00 }),
  ]
  const payments = [payment({ id: 'p', loanId: 'juan-1', amount: 1_000_00 })]

  it('nets open personal loans in both directions', () => {
    expect(loanTotals(loans, payments)).toEqual({
      owedToYou: 12_500_00,
      youOwe: 4_000_00,
      net: 8_500_00,
    })
  })

  it('leaves formal loans to their own section', () => {
    // The ₱650,000 car loan must not land in "you owe" beside a ₱4,000 debt.
    expect(loanTotals(loans, payments).youOwe).toBe(4_000_00)
  })
})

describe('byContact', () => {
  const loans = [
    loan({ id: 'juan-1', principal: 3_000_00, contactId: 'juan' }),
    loan({ id: 'juan-2', principal: 3_500_00, contactId: 'juan' }),
    loan({ id: 'ken', principal: 4_000_00, contactId: 'ken', direction: 'borrowed' }),
    loan({ id: 'settled', principal: 800_00, contactId: 'juan', status: 'settled' }),
    loan({ id: 'car', kind: 'formal', direction: 'borrowed', principal: 650_000_00 }),
  ]
  const payments = [payment({ id: 'p', loanId: 'juan-1', amount: 1_000_00 })]

  it('groups open loans under each person', () => {
    const grouped = byContact(loans, payments)
    expect(grouped.get('juan')?.loans).toHaveLength(2)
    expect(grouped.get('juan')?.net).toBe(5_500_00)
  })

  it('signs what the user owes as negative', () => {
    expect(byContact(loans, payments).get('ken')?.net).toBe(-4_000_00)
  })

  it('skips loans with no contact', () => {
    expect(byContact(loans, payments).size).toBe(2)
  })
})

describe('rate basis', () => {
  it('stores a monthly quote as its nominal annual rate', () => {
    expect(toAnnualRate(3.95, 'month')).toBeCloseTo(47.4, 10)
    expect(toAnnualRate(9.5, 'year')).toBe(9.5)
  })

  it('reads the stored rate back in the unit it was quoted in', () => {
    expect(fromAnnualRate(47.4, 'month')).toBeCloseTo(3.95, 10)
    expect(fromAnnualRate(9.5, 'year')).toBe(9.5)
  })

  it('round-trips, so editing a loan does not drift the rate', () => {
    for (const rate of [0, 1, 3.95, 7.5, 12.25]) {
      expect(fromAnnualRate(toAnnualRate(rate, 'month'), 'month')).toBeCloseTo(rate, 10)
      expect(fromAnnualRate(toAnnualRate(rate, 'year'), 'year')).toBeCloseTo(rate, 10)
    }
  })

  it('leaves a 0% plan at zero under either unit', () => {
    expect(toAnnualRate(0, 'month')).toBe(0)
    expect(fromAnnualRate(0, 'month')).toBe(0)
  })

  it('labels a rate the way it was quoted', () => {
    expect(rateLabel(47.4, 'month')).toBe('3.95% a month')
    expect(rateLabel(47.4, 'year')).toBe('47.40% a year')
    expect(rateLabel(12, 'year')).toBe('12% a year')
  })
})
