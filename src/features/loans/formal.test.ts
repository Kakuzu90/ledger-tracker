import { describe, expect, it } from 'vitest'
import { buildSampleData } from '@/db/sample'
import type { Account, Loan, LoanPayment } from '@/db/types'
import { buildFormalView, scheduleWindow, simulate } from './formal'

const TODAY = '2026-10-14'
const sample = buildSampleData({ today: new Date(2026, 9, 14) })

const sampleLoan = (note: string) => {
  const loan = sample.loans.find((row) => row.note === note)
  if (!loan) throw new Error(`no sample loan called ${note}`)
  return buildFormalView(
    { loan, payments: sample.loanPayments, accounts: sample.accounts },
    TODAY,
  )
}

const car = sampleLoan('Car loan')
const laptop = sampleLoan('Laptop installment')

const stamps = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }

const loan = (over: Partial<Loan> = {}): Loan => ({
  id: 'l',
  kind: 'formal',
  direction: 'borrowed',
  lender: 'BDO',
  principal: 650_000_00,
  ratePct: 9.5,
  termMonths: 60,
  startDate: '2024-09-14',
  note: 'Car loan',
  status: 'open',
  ...stamps,
  ...over,
})

const payments = (n: number, loanId = 'l'): LoanPayment[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    loanId,
    amount: 13_651_21,
    date: '2026-01-14',
    transactionId: `t${i}`,
    installmentNo: i + 1,
    ...stamps,
  }))

const view = (over: Partial<Loan> = {}, paid = 24, accounts: Account[] = []) =>
  buildFormalView({ loan: loan(over), payments: payments(paid), accounts }, TODAY)

describe('buildFormalView, against the sample car loan', () => {
  it('spells out the terms the way the mockup does', () => {
    expect(car.terms).toBe('BDO · 9.5% a year · 60 months')
  })

  it('reports the amortised balance, not principal less payments', () => {
    expect(car.remaining).toBe(426_161_50)
    expect(car.paidCount).toBe(24)
    expect(Math.round(car.share * 100)).toBe(34)
  })

  it('works out the instalment and the interest handed over so far', () => {
    expect(car.monthly).toBe(13_651_21)
    expect(car.interestPaid).toBe(103_790_54)
  })

  it('puts the next payment a month after the last', () => {
    expect(car.nextNumber).toBe(25)
    expect(car.nextDue).toBe('2026-10-14')
    expect(car.nextLabel).toBe('October')
  })

  it('finishes five years after it started', () => {
    expect(car.payoffDate).toBe('2029-09-14')
  })

  it('names the account the payment will post to', () => {
    expect(car.accountName).toBe('BPI Savings')
  })

  it('builds the whole contracted schedule', () => {
    expect(car.schedule).toHaveLength(60)
    expect(car.schedule.at(-1)?.balance).toBe(0)
  })

  it('marks what is paid, what is due and what is still to come', () => {
    expect(car.schedule[23]?.status).toBe('paid')
    expect(car.schedule[24]?.status).toBe('due')
    expect(car.schedule[25]?.status).toBe('future')
  })

  it('dates and labels each row by its month', () => {
    expect(car.schedule[24]?.date).toBe('2026-10-14')
    expect(car.schedule[24]?.label).toBe('Oct')
    // The year is worth printing where it turns.
    expect(car.schedule[27]?.label).toBe("Jan '27")
  })
})

describe('a 0% instalment plan', () => {
  it('splits evenly with no interest at all', () => {
    expect(laptop.terms).toBe('BPI Visa · 0% a year · 12 months')
    expect(laptop.monthly).toBe(4_500_00)
    expect(laptop.interestPaid).toBe(0)
    expect(laptop.remaining).toBe(27_000_00)
    expect(laptop.schedule.every((row) => row.interest === 0)).toBe(true)
  })
})

describe('edges', () => {
  it('flags a payment that is past its date', () => {
    expect(view({ startDate: '2024-01-14' }).overdue).toBe(true)
    expect(view({ startDate: '2025-09-14' }).overdue).toBe(false)
  })

  it('closes out a loan once every instalment is in', () => {
    const done = view({}, 60)
    expect(done.settled).toBe(true)
    expect(done.remaining).toBe(0)
    expect(done.nextDue).toBeUndefined()
    expect(done.payoffDate).toBeUndefined()
  })

  it('respects a loan marked settled early', () => {
    expect(view({ status: 'settled' }).settled).toBe(true)
  })

  it('falls back to principal less payments without a term', () => {
    const bare = view({ termMonths: undefined, ratePct: undefined, principal: 50_000_00 }, 2)
    expect(bare.amortises).toBe(false)
    expect(bare.schedule).toEqual([])
    expect(bare.monthly).toBe(0)
    // 50,000 less two 13,651.21 payments.
    expect(bare.remaining).toBe(50_000_00 - 2 * 13_651_21)
    expect(bare.terms).toBe('BDO')
  })

  it('ignores payments belonging to another loan', () => {
    const other = buildFormalView(
      { loan: loan(), payments: payments(24, 'somewhere-else'), accounts: [] },
      TODAY,
    )
    expect(other.paidCount).toBe(0)
    expect(other.remaining).toBe(650_000_00)
  })
})

describe('simulate', () => {
  it('reproduces the mockup: ₱2,000 a month finishes five months sooner', () => {
    const result = simulate(car, 2_000_00)
    expect(result.monthsSaved).toBe(5)
    expect(result.interestSaved).toBe(9_550_13)
    expect(result.payoffDate).toBe('2029-04-14')
  })

  it('leaves the payoff date where it was with no extra', () => {
    const result = simulate(car, 0)
    expect(result.monthsSaved).toBe(0)
    expect(result.payoffDate).toBe(car.payoffDate)
  })

  it('runs off what is left, not the original principal', () => {
    // Same loan, one payment in: far more interest is still on the table.
    const early = simulate(view({}, 1), 2_000_00)
    expect(early.baseInterest).toBeGreaterThan(simulate(car, 2_000_00).baseInterest)
  })

  it('cannot save anything on a 0% plan but still ends it sooner', () => {
    const result = simulate(laptop, 4_500_00)
    expect(result.interestSaved).toBe(0)
    expect(result.monthsSaved).toBe(3)
  })

  it('reports nothing left to simulate on a settled loan', () => {
    const result = simulate(view({}, 60), 2_000_00)
    expect(result.basePayments).toBe(0)
    expect(result.payoffDate).toBeUndefined()
  })
})

describe('scheduleWindow', () => {
  it('shows the two before, the one due and the three after', () => {
    const window = scheduleWindow(car.schedule)
    expect(window.map((row) => row.n)).toEqual([23, 24, 25, 26, 27, 28])
    expect(window[2]?.status).toBe('due')
  })

  it('does not run off the front of a new loan', () => {
    const fresh = view({}, 0)
    expect(scheduleWindow(fresh.schedule).map((row) => row.n)).toEqual([1, 2, 3, 4])
  })

  it('falls back to the tail when everything is paid', () => {
    const done = view({}, 60)
    expect(scheduleWindow(done.schedule).map((row) => row.n)).toEqual([55, 56, 57, 58, 59, 60])
  })

  it('copes with a schedule shorter than the window', () => {
    const short = view({ termMonths: 3, principal: 3_000_00 }, 0)
    expect(scheduleWindow(short.schedule)).toHaveLength(3)
  })
})
