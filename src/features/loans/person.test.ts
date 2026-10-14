import { describe, expect, it } from 'vitest'
import { buildSampleData } from '@/db/sample'
import type { Account, Loan, LoanPayment } from '@/db/types'
import { buildPersonView, reminderMessage } from './person'

const TODAY = '2026-10-14'
const sample = buildSampleData({ today: new Date(2026, 9, 14) })

const person = (name: string) => {
  const contact = sample.contacts.find((c) => c.name === name)
  if (!contact) throw new Error(`no sample contact named ${name}`)
  return buildPersonView(
    {
      contact,
      loans: sample.loans,
      payments: sample.loanPayments,
      accounts: sample.accounts,
    },
    TODAY,
  )
}

const juan = person('Juan Dela Cruz')
const ken = person('Ken Reyes')
const ana = person('Ana Lim')

const card = (note: string) =>
  [...juan.open, ...juan.settled].find((row) => row.loan.note === note)

const stamps = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }

const loan = (over: Partial<Loan> & Pick<Loan, 'id'>): Loan => ({
  kind: 'personal',
  direction: 'lent',
  contactId: 'c',
  principal: 2_000_00,
  startDate: '2026-09-02',
  note: 'Concert tickets',
  status: 'open',
  ...stamps,
  ...over,
})

describe('buildPersonView, for someone who owes you', () => {
  it('nets what is left across their loans', () => {
    expect(juan.net).toBe(5_500_00)
    expect(juan.headline).toBe('Juan owes you')
  })

  it('counts the open loans and what has moved', () => {
    expect(juan.openCount).toBe(2)
    expect(juan.lent).toBe(6_500_00)
    expect(juan.repaid).toBe(1_000_00)
    // The settled lunch money stays out of the open figures.
    expect(juan.borrowed).toBe(0)
  })

  it('leads with the overdue loan', () => {
    expect(juan.open.map((row) => row.loan.note)).toEqual(['Concert tickets', 'Phone repair'])
  })

  it('shows a part-repaid loan as what is left of it', () => {
    const concert = card('Concert tickets')
    expect(concert?.repaid).toBe(1_000_00)
    expect(concert?.outstanding).toBe(2_000_00)
    expect(concert?.share).toBeCloseTo(1 / 3, 5)
  })

  it('badges an overdue loan with how late it is', () => {
    expect(card('Concert tickets')?.badge).toEqual({ text: 'Overdue 3 days', tone: 'overdue' })
    expect(card('Phone repair')?.badge).toEqual({ text: 'Open', tone: 'open' })
    expect(card('Lunch money')?.badge).toEqual({ text: 'Settled', tone: 'settled' })
  })

  it('says when it was lent, out of what, and when it is due', () => {
    expect(card('Concert tickets')?.subtitle).toBe(
      'Lent Sep 14 from BPI Savings · due Oct 11',
    )
    expect(card('Phone repair')?.subtitle).toBe('Lent Oct 8 from GCash · no due date')
  })

  it('keeps settled loans in their own list', () => {
    expect(juan.open.some((row) => row.loan.note === 'Lunch money')).toBe(false)
    expect(juan.settled.map((row) => row.loan.note)).toEqual(['Lunch money'])
  })
})

describe('history', () => {
  it('lists every loan and every payment, newest first', () => {
    expect(juan.history.map((entry) => [entry.date, entry.title])).toEqual([
      ['2026-10-08', 'Lent · Phone repair'],
      ['2026-10-05', 'Payment received'],
      ['2026-09-14', 'Lent · Concert tickets'],
      ['2026-08-14', 'Payment received'],
      ['2026-07-14', 'Lent · Lunch money'],
    ])
  })

  it('names the account on both sides of a loan', () => {
    const lent = juan.history.find((entry) => entry.title === 'Lent · Phone repair')
    const paid = juan.history.find((entry) => entry.kind === 'payment')
    expect(lent?.subtitle).toBe('Oct 8 · from GCash')
    expect(paid?.subtitle).toBe('Oct 5 · into GCash · Concert tickets')
  })

  it('signs a repayment as money coming in', () => {
    expect(juan.history.find((entry) => entry.kind === 'payment')?.amount).toBe(1_000_00)
  })

  it('marks a split loan as having moved no money of its own', () => {
    expect(ana.history[0]?.subtitle).toBe('Oct 10 · from a split')
    expect(ana.open[0]?.subtitle).toBe('Lent Oct 10 from a split · no due date')
  })
})

describe('someone you owe', () => {
  it('turns the headline around', () => {
    expect(ken.net).toBe(-4_000_00)
    expect(ken.headline).toBe('You owe Ken')
    expect(ken.borrowed).toBe(4_000_00)
  })

  it('has nothing to remind them about', () => {
    expect(ken.canRemind).toBe(false)
    expect(ken.reminder).toBe('')
  })

  it('records the money as having come in', () => {
    expect(ken.history[0]?.subtitle).toBe('Oct 6 · into GCash')
  })
})

describe('reminderMessage', () => {
  const overdue = loan({ id: 'a', dueDate: '2026-10-11' })

  it('names a single overdue loan and what it was for', () => {
    expect(reminderMessage('Juan Dela Cruz', [overdue], [], TODAY)).toBe(
      'Hi Juan! Friendly reminder about the ₱2,000 for concert tickets that was due Oct 11. Thanks!',
    )
  })

  it('reads a future due date as still to come', () => {
    expect(reminderMessage('Juan', [loan({ id: 'a', dueDate: '2026-10-30' })], [], TODAY)).toContain(
      'due Oct 30. Thanks!',
    )
  })

  it('leaves the date out when there is none', () => {
    expect(reminderMessage('Juan', [loan({ id: 'a' })], [], TODAY)).toBe(
      'Hi Juan! Friendly reminder about the ₱2,000 for concert tickets. Thanks!',
    )
  })

  it('sums several loans rather than listing them', () => {
    expect(
      reminderMessage(
        'Juan',
        [overdue, loan({ id: 'b', principal: 3_500_00, note: 'Phone repair' })],
        [],
        TODAY,
      ),
    ).toBe('Hi Juan! Friendly reminder about the ₱5,500 across 2 loans. Thanks!')
  })

  it('asks for what is left, not the original amount', () => {
    const part: LoanPayment = {
      id: 'p',
      loanId: 'a',
      amount: 500_00,
      date: '2026-10-05',
      transactionId: 't',
      ...stamps,
    }
    expect(reminderMessage('Juan', [overdue], [part], TODAY)).toContain('₱1,500')
  })

  it('says nothing when everything is settled', () => {
    expect(reminderMessage('Juan', [loan({ id: 'a', status: 'settled' })], [], TODAY)).toBe('')
  })

  it('does not chase someone for money you borrowed', () => {
    expect(reminderMessage('Ken', [loan({ id: 'a', direction: 'borrowed' })], [], TODAY)).toBe('')
  })

  it('keeps an acronym capitalised inside the sentence', () => {
    expect(reminderMessage('Ken', [loan({ id: 'a', note: 'MRT load' })], [], TODAY)).toContain(
      'for MRT load',
    )
  })
})

describe('edge cases', () => {
  const contact = { id: 'c', name: 'Sam Cruz', note: '', ...stamps }
  const accounts: Account[] = []

  it('says so when nothing is outstanding', () => {
    const view = buildPersonView(
      { contact, loans: [loan({ id: 'a', status: 'settled' })], payments: [], accounts },
      TODAY,
    )
    expect(view.net).toBe(0)
    expect(view.headline).toBe('Settled up with Sam')
    expect(view.open).toEqual([])
  })

  it('handles a loan with no account behind it', () => {
    const view = buildPersonView(
      { contact, loans: [loan({ id: 'a', accountId: undefined })], payments: [], accounts },
      TODAY,
    )
    expect(view.open[0]?.subtitle).toBe('Lent Sep 2 · no due date')
    expect(view.history[0]?.subtitle).toBe('Sep 2')
  })

  it('ignores loans belonging to someone else', () => {
    const view = buildPersonView(
      { contact, loans: [loan({ id: 'a', contactId: 'other' })], payments: [], accounts },
      TODAY,
    )
    expect(view.open).toEqual([])
  })
})
