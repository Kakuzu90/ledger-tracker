import { describe, expect, it } from 'vitest'
import {
  extraPaymentEffect,
  interestPaid,
  loanCost,
  monthlyPayment,
  paidShare,
  remainingBalance,
  remainingSchedule,
  schedule,
} from './amortization'

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

// Where the car loan actually stands on the detail screen: 24 of 60 paid.
const BALANCE = remainingBalance(...CAR, 24)
const INSTALMENT = monthlyPayment(...CAR)

describe('remainingSchedule', () => {
  const rows = remainingSchedule(BALANCE, 9.5, INSTALMENT)

  it('runs out the instalments that are left, not the whole term', () => {
    expect(rows).toHaveLength(36)
  })

  it('picks up where the original schedule left off', () => {
    const whole = schedule(...CAR)
    expect(rows[0]?.interest).toBe(whole[24]?.interest)
    expect(rows[0]?.balance).toBe(whole[24]?.balance)
  })

  it('finishes at exactly zero without overpaying', () => {
    expect(rows.at(-1)?.balance).toBe(0)
    expect(rows.at(-1)!.payment).toBeLessThanOrEqual(INSTALMENT)
  })

  it('numbers the rows from where the loan is', () => {
    expect(remainingSchedule(BALANCE, 9.5, INSTALMENT, 25)[0]?.n).toBe(25)
  })

  it('clears sooner when the payment is larger', () => {
    expect(remainingSchedule(BALANCE, 9.5, INSTALMENT + 5_000_00)).toHaveLength(26)
  })

  it('refuses a payment that cannot cover the interest', () => {
    // ₱426k at 9.5% accrues about ₱3,374 a month.
    expect(remainingSchedule(BALANCE, 9.5, 3_000_00)).toEqual([])
  })

  it('is empty for a loan with nothing left', () => {
    expect(remainingSchedule(0, 9.5, INSTALMENT)).toEqual([])
    expect(remainingSchedule(BALANCE, 9.5, 0)).toEqual([])
  })

  it('divides the balance evenly at 0%', () => {
    const free = remainingSchedule(27_000_00, 0, 4_500_00)
    expect(free).toHaveLength(6)
    expect(free.every((row) => row.interest === 0)).toBe(true)
  })
})

describe('interestPaid', () => {
  it('adds up what the first 24 payments cost in interest', () => {
    expect(interestPaid(...CAR, 24)).toBe(103_790_54)
  })

  it('is nothing before the first payment', () => {
    expect(interestPaid(...CAR, 0)).toBe(0)
    expect(interestPaid(...CAR, -3)).toBe(0)
  })

  it('tops out at the whole cost of the loan', () => {
    expect(interestPaid(...CAR, 99)).toBe(loanCost(...CAR).totalInterest)
  })

  it('is nothing at all at 0%', () => {
    expect(interestPaid(54_000_00, 0, 12, 6)).toBe(0)
  })
})

describe('extraPaymentEffect', () => {
  const effect = extraPaymentEffect(BALANCE, 9.5, INSTALMENT, 2_000_00)

  it('finishes the car loan five months sooner on ₱2,000 a month', () => {
    expect(effect.basePayments).toBe(36)
    expect(effect.payments).toBe(31)
    expect(effect.monthsSaved).toBe(5)
  })

  it('works out the interest that buys back', () => {
    // The mockup prints ≈ ₱9,540 against this slider position.
    expect(effect.interestSaved).toBe(9_550_13)
    expect(effect.baseInterest - effect.interest).toBe(effect.interestSaved)
  })

  it('changes nothing with no extra', () => {
    const none = extraPaymentEffect(BALANCE, 9.5, INSTALMENT, 0)
    expect(none.monthsSaved).toBe(0)
    expect(none.interestSaved).toBe(0)
  })

  it('saves more the more you pay', () => {
    const small = extraPaymentEffect(BALANCE, 9.5, INSTALMENT, 500_00)
    const large = extraPaymentEffect(BALANCE, 9.5, INSTALMENT, 10_000_00)
    expect(large.monthsSaved).toBeGreaterThan(small.monthsSaved)
    expect(large.interestSaved).toBeGreaterThan(small.interestSaved)
  })

  it('treats a negative extra as none', () => {
    expect(extraPaymentEffect(BALANCE, 9.5, INSTALMENT, -5_000_00).monthsSaved).toBe(0)
  })

  it('saves no interest at 0% — only time', () => {
    const free = extraPaymentEffect(27_000_00, 0, 4_500_00, 4_500_00)
    expect(free.monthsSaved).toBe(3)
    expect(free.interestSaved).toBe(0)
  })

  it('says so when the payment never clears the interest', () => {
    const stuck = extraPaymentEffect(BALANCE, 9.5, 3_000_00, 0)
    expect(stuck.amortises).toBe(false)
    expect(stuck.basePayments).toBe(0)
  })
})
