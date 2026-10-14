import { describe, expect, it } from 'vitest'
import { buildSampleData } from '@/db/sample'
import type { Contact, Loan, LoanPayment } from '@/db/types'
import {
  buildLoansView,
  formalRemaining,
  formatRate,
  loansDueSoon,
  overdueDays,
  selectLoans,
} from './loans'

const TODAY = '2026-10-14'
const sample = buildSampleData({ today: new Date(2026, 9, 14) })
const input = {
  contacts: sample.contacts,
  loans: sample.loans,
  payments: sample.loanPayments,
}
const view = buildLoansView(input, TODAY)

const named = (name: string) => view.people.find((row) => row.contact.name === name)

const stamps = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }

const loan = (over: Partial<Loan> & Pick<Loan, 'id'>): Loan => ({
  kind: 'personal',
  direction: 'lent',
  principal: 1_000_00,
  startDate: '2026-09-01',
  note: 'Loan',
  status: 'open',
  ...stamps,
  ...over,
})

const payment = (over: Partial<LoanPayment> & Pick<LoanPayment, 'id' | 'loanId'>): LoanPayment => ({
  amount: 500_00,
  date: '2026-10-01',
  transactionId: 't',
  ...stamps,
  ...over,
})

const contact = (id: string, name: string): Contact => ({ id, name, note: '', ...stamps })

describe('formatRate', () => {
  it.each([
    [9.5, '9.5%'],
    [0, '0%'],
    [12, '12%'],
    [3.456, '3.46%'],
  ])('renders %s as %s', (rate, expected) => {
    expect(formatRate(rate)).toBe(expected)
  })
})

describe('overdueDays', () => {
  const late = loan({ id: 'a', dueDate: '2026-10-11' })

  it('counts whole days past the due date', () => {
    expect(overdueDays(late, [], TODAY)).toBe(3)
  })

  it('is zero on the due date itself', () => {
    expect(overdueDays(loan({ id: 'a', dueDate: TODAY }), [], TODAY)).toBe(0)
  })

  it('is zero without a due date', () => {
    expect(overdueDays(loan({ id: 'a' }), [], TODAY)).toBe(0)
  })

  it('stops once the loan is repaid', () => {
    const paid = [payment({ id: 'p', loanId: 'a', amount: 1_000_00 })]
    expect(overdueDays(late, paid, TODAY)).toBe(0)
  })
})

describe('formalRemaining', () => {
  it('amortises a loan that carries a rate', () => {
    const car = loan({
      id: 'car',
      kind: 'formal',
      direction: 'borrowed',
      principal: 650_000_00,
      ratePct: 9.5,
      termMonths: 60,
    })
    const paid = Array.from({ length: 24 }, (_, i) =>
      payment({ id: `p${i}`, loanId: 'car', amount: 13_651_00 }),
    )

    // Interest means the balance is not principal less payments.
    expect(formalRemaining(car, paid)).toBe(426_161_50)
  })

  it('falls back to principal less payments without a term', () => {
    const bare = loan({ id: 'b', kind: 'formal', principal: 10_000_00 })
    expect(formalRemaining(bare, [payment({ id: 'p', loanId: 'b', amount: 2_500_00 })])).toBe(
      7_500_00,
    )
  })
})

describe('buildLoansView, against the sample ledger', () => {
  it('reports the two totals from the mockup', () => {
    expect(view.totals).toEqual({ owedToYou: 12_500_00, youOwe: 4_000_00, net: 8_500_00 })
  })

  it('groups every open personal loan under its person', () => {
    expect(view.people.map((row) => [row.contact.name, row.net])).toEqual([
      ['Juan Dela Cruz', 5_500_00],
      ['Maria Santos', 4_500_00],
      ['Ken Reyes', -4_000_00],
      ['Ana Lim', 2_500_00],
    ])
  })

  it('leads with whoever is overdue', () => {
    expect(view.people[0]?.contact.name).toBe('Juan Dela Cruz')
    expect(view.people[0]?.overdueDays).toBe(3)
  })

  it('counts a person with several loans rather than naming one', () => {
    expect(named('Juan Dela Cruz')?.subtitle).toBe('2 loans')
  })

  it('shows the due date when there is a single loan', () => {
    expect(named('Maria Santos')?.subtitle).toBe('Due Oct 30')
    expect(named('Ken Reyes')?.subtitle).toBe('Due Nov 5')
  })

  it('says where a split loan came from', () => {
    expect(named('Ana Lim')?.subtitle).toBe('From split · Dinner · Ramen place')
  })

  it('shows what you owe as a negative', () => {
    expect(named('Ken Reyes')?.net).toBe(-4_000_00)
  })

  it('lists the formal loans, largest first', () => {
    expect(view.formal.map((row) => [row.title, row.subtitle, row.remaining])).toEqual([
      ['Car loan · BDO', '9.5% · 24 of 60 paid', 426_161_50],
      ['Laptop installment · BPI Visa', '0% · 6 of 12 paid', 27_000_00],
    ])
  })

  it('works out how much of a formal loan is behind it', () => {
    expect(Math.round((view.formal[1]?.share ?? 0) * 100)).toBe(50)
  })

  it('counts the chips from every loan, not the filtered set', () => {
    expect(view.overdueCount).toBe(1)
    expect(view.settledCount).toBe(1)
    expect(view.openPersonalCount).toBe(5)
  })
})

describe('filters', () => {
  const people = (filter: Parameters<typeof buildLoansView>[2]) =>
    buildLoansView(input, TODAY, filter).people.map((row) => row.contact.name)

  it('keeps only what you lent out', () => {
    expect(people('lent')).not.toContain('Ken Reyes')
    expect(people('lent')).toContain('Ana Lim')
  })

  it('keeps only what you borrowed, formal loans included', () => {
    expect(people('borrowed')).toEqual(['Ken Reyes'])
    expect(buildLoansView(input, TODAY, 'borrowed').formal).toHaveLength(2)
  })

  it('narrows a person to the loan that is actually overdue', () => {
    const overdue = buildLoansView(input, TODAY, 'overdue')
    expect(overdue.people).toHaveLength(1)
    expect(overdue.people[0]?.loans.map((l) => l.note)).toEqual(['Concert tickets'])
    expect(overdue.people[0]?.subtitle).toBe('Due Oct 11')
  })

  it('hides formal loans from the lent and overdue views', () => {
    expect(buildLoansView(input, TODAY, 'lent').formal).toEqual([])
    expect(buildLoansView(input, TODAY, 'overdue').formal).toEqual([])
  })

  it('shows settled loans only under Settled', () => {
    const settled = buildLoansView(input, TODAY, 'settled')
    expect(settled.people.map((row) => row.loans.map((l) => l.note))).toEqual([['Lunch money']])
    // The totals card keeps speaking for the open loans.
    expect(settled.totals.owedToYou).toBe(12_500_00)
  })
})

describe('selectLoans', () => {
  it('treats a fully repaid loan as settled even while it is marked open', () => {
    const open = loan({ id: 'a', principal: 1_000_00 })
    const paid = [payment({ id: 'p', loanId: 'a', amount: 1_000_00 })]

    expect(selectLoans([open], paid, 'all', TODAY)).toEqual([])
    expect(selectLoans([open], paid, 'settled', TODAY)).toEqual([open])
  })
})

describe('edge cases', () => {
  it('reports zeroes on an empty ledger', () => {
    const empty = buildLoansView({ contacts: [], loans: [], payments: [] }, TODAY)
    expect(empty.totals.net).toBe(0)
    expect(empty.people).toEqual([])
    expect(empty.formal).toEqual([])
  })

  it('drops a loan whose contact has been removed', () => {
    const orphan = buildLoansView(
      { contacts: [], loans: [loan({ id: 'a', contactId: 'gone' })], payments: [] },
      TODAY,
    )
    expect(orphan.people).toEqual([])
  })

  it('nets a person who both owes you and is owed', () => {
    const both = buildLoansView(
      {
        contacts: [contact('c', 'Sam Cruz')],
        loans: [
          loan({ id: 'a', contactId: 'c', principal: 3_000_00, direction: 'lent' }),
          loan({ id: 'b', contactId: 'c', principal: 1_200_00, direction: 'borrowed' }),
        ],
        payments: [],
      },
      TODAY,
    )
    expect(both.people[0]?.net).toBe(1_800_00)
    expect(both.totals).toEqual({ owedToYou: 3_000_00, youOwe: 1_200_00, net: 1_800_00 })
  })
})

describe('loansDueSoon', () => {
  it('names the person behind an overdue personal loan', () => {
    expect(loansDueSoon(input, TODAY)).toEqual(['Juan Dela Cruz'])
  })

  it('reaches further forward when asked to', () => {
    // Maria's tuition help is due in 16 days, Ken's cash in 22.
    expect(loansDueSoon(input, TODAY, 20)).toEqual(['Juan Dela Cruz', 'Maria Santos'])
    expect(loansDueSoon(input, TODAY, 30)).toHaveLength(3)
  })

  it('leaves out a loan with no due date', () => {
    // Phone repair and the dinner split never had one.
    expect(loansDueSoon(input, TODAY, 365)).not.toContain('Ana Lim')
  })

  it('leaves out a loan that has been settled', () => {
    const settled = loan({ id: 'l1', dueDate: '2026-10-01', contactId: 'c1' })
    const contacts: Contact[] = [{ id: 'c1', name: 'Pia', ...stamps }]
    const payments: LoanPayment[] = [
      {
        id: 'p1',
        loanId: 'l1',
        amount: 1_000_00,
        date: '2026-10-02',
        transactionId: 't1',
        ...stamps,
      },
    ]

    expect(loansDueSoon({ contacts, loans: [settled], payments }, TODAY)).toEqual([])
    expect(loansDueSoon({ contacts, loans: [settled], payments: [] }, TODAY)).toEqual(['Pia'])
  })

  it('names a formal loan after the loan, not a person', () => {
    const formal = loan({
      id: 'l2',
      kind: 'formal',
      direction: 'borrowed',
      lender: 'BDO',
      note: 'Car loan',
      dueDate: '2026-10-14',
    })
    expect(loansDueSoon({ contacts: [], loans: [formal], payments: [] }, TODAY)).toEqual([
      'Car loan',
    ])
  })

  it('puts the one due soonest first', () => {
    const later = loan({ id: 'a', contactId: 'c1', dueDate: '2026-10-15' })
    const sooner = loan({ id: 'b', contactId: 'c2', dueDate: '2026-10-01' })
    const contacts: Contact[] = [
      { id: 'c1', name: 'Later', ...stamps },
      { id: 'c2', name: 'Sooner', ...stamps },
    ]
    expect(
      loansDueSoon({ contacts, loans: [later, sooner], payments: [] }, TODAY, 7),
    ).toEqual(['Sooner', 'Later'])
  })
})
