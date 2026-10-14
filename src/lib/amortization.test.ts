import { describe, expect, it } from 'vitest'
import { loanCost, monthlyPayment, paidShare, remainingBalance, schedule } from './amortization'

// The car loan from design/Loans.dc.html: ₱650,000 at 9.5% over 60 months.
const CAR = [650_000_00, 9.5, 60] as const

describe('monthlyPayment', () => {
  it('matches the ₱13,651 instalment in the mockups', () => {
    expect(monthlyPayment(...CAR)).toBe(13_651_21)
  })

  it('divides evenly at 0%', () => {
    expect(monthlyPayment(54_000_00, 0, 12)).toBe(4_500_00)
  })

  it('is zero for a loan with no principal or no term', () => {
    expect(monthlyPayment(0, 9.5, 60)).toBe(0)
    expect(monthlyPayment(650_000_00, 9.5, 0)).toBe(0)
  })
})

describe('schedule', () => {
  const rows = schedule(...CAR)

  it('runs for the whole term', () => {
    expect(rows).toHaveLength(60)
  })

  it('finishes at exactly zero', () => {
    expect(rows.at(-1)?.balance).toBe(0)
  })

  it('splits every payment into interest and principal', () => {
    for (const row of rows) {
      expect(row.interest + row.principal).toBe(row.payment)
      expect(Number.isInteger(row.payment)).toBe(true)
    }
  })

  it('shifts from interest to principal over the term', () => {
    expect(rows[0]!.interest).toBeGreaterThan(rows[0]!.principal / 2)
    expect(rows.at(-1)!.interest).toBeLessThan(rows.at(-1)!.principal)
  })

  it('clears the loan sooner with an extra payment each month', () => {
    const faster = schedule(...CAR, 5_000_00)
    expect(faster.length).toBeLessThan(rows.length)
    expect(faster.at(-1)?.balance).toBe(0)
  })

  it('never overpays on the final instalment', () => {
    const faster = schedule(...CAR, 5_000_00)
    expect(faster.at(-1)!.payment).toBeLessThanOrEqual(
      faster.at(-2)!.balance + faster.at(-1)!.interest,
    )
  })
})

describe('remainingBalance', () => {
  it('leaves about ₱426,000 after 24 of 60 payments', () => {
    expect(remainingBalance(...CAR, 24)).toBe(426_161_50)
  })

  it('is the whole principal before the first payment', () => {
    expect(remainingBalance(...CAR, 0)).toBe(650_000_00)
  })

  it('is zero once the term is served', () => {
    expect(remainingBalance(...CAR, 60)).toBe(0)
    expect(remainingBalance(...CAR, 99)).toBe(0)
  })

  it('is principal less payments at 0%', () => {
    expect(remainingBalance(54_000_00, 0, 12, 6)).toBe(27_000_00)
  })
})

describe('paidShare', () => {
  it('is the 34% the mockup draws after 24 payments', () => {
    expect(Math.round(paidShare(...CAR, 24) * 100)).toBe(34)
  })

  it('shows half the principal gone later than halfway through the term', () => {
    // Interest front-loading: at month 30 of 60, less than half is repaid.
    expect(paidShare(...CAR, 30)).toBeLessThan(0.5)
  })
})

describe('loanCost', () => {
  it('adds up what the loan costs over its life', () => {
    const cost = loanCost(...CAR)
    expect(cost.monthly).toBe(13_651_21)
    expect(cost.payments).toBe(60)
    expect(cost.totalInterest).toBe(cost.totalPaid - 650_000_00)
  })

  it('saves interest when paying extra', () => {
    expect(loanCost(...CAR, 5_000_00).totalInterest).toBeLessThan(
      loanCost(...CAR).totalInterest,
    )
  })
})
