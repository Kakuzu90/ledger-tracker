/**
 * Amortisation for formal loans. Everything is integer centavos, and the
 * schedule is walked payment by payment with the interest rounded each month —
 * the way a lender actually amortises — rather than with a closed-form
 * balance, which drifts from the statement by a few centavos.
 */

import type { Centavos } from '@/db/types'

/** Nominal annual rate as a percentage → monthly rate. */
const monthlyRate = (annualRatePct: number): number => annualRatePct / 100 / 12

/** The level payment that clears `principal` over `termMonths`. */
export function monthlyPayment(
  principal: Centavos,
  annualRatePct: number,
  termMonths: number,
): Centavos {
  if (termMonths <= 0 || principal <= 0) return 0

  const rate = monthlyRate(annualRatePct)
  if (rate === 0) return Math.round(principal / termMonths)

  const growth = (1 + rate) ** termMonths
  return Math.round((principal * rate * growth) / (growth - 1))
}

export interface Installment {
  /** 1-based payment number. */
  n: number
  payment: Centavos
  interest: Centavos
  principal: Centavos
  /** What is still owed once this payment lands. */
  balance: Centavos
}

/**
 * The full schedule. The last payment absorbs the rounding so the balance
 * finishes at exactly zero.
 */
export function schedule(
  principal: Centavos,
  annualRatePct: number,
  termMonths: number,
  extraPerMonth: Centavos = 0,
): Installment[] {
  if (termMonths <= 0 || principal <= 0) return []

  const rate = monthlyRate(annualRatePct)
  const base = monthlyPayment(principal, annualRatePct, termMonths) + extraPerMonth
  const rows: Installment[] = []

  let balance = principal
  for (let n = 1; n <= termMonths && balance > 0; n++) {
    const interest = Math.round(balance * rate)
    // Never pay more than what is left plus this month's interest.
    const payment = Math.min(base, balance + interest)
    const toPrincipal = payment - interest
    balance -= toPrincipal
    rows.push({ n, payment, interest, principal: toPrincipal, balance })
  }

  return rows
}

/** What is still owed after `paymentsMade` instalments. */
export function remainingBalance(
  principal: Centavos,
  annualRatePct: number,
  termMonths: number,
  paymentsMade: number,
): Centavos {
  if (paymentsMade <= 0) return Math.max(0, principal)

  const rows = schedule(principal, annualRatePct, termMonths)
  if (paymentsMade >= rows.length) return 0
  return rows[paymentsMade - 1]?.balance ?? 0
}

/** 0–1 share of the principal cleared after `paymentsMade` instalments. */
export function paidShare(
  principal: Centavos,
  annualRatePct: number,
  termMonths: number,
  paymentsMade: number,
): number {
  if (principal <= 0) return 1
  const left = remainingBalance(principal, annualRatePct, termMonths, paymentsMade)
  return (principal - left) / principal
}

export interface LoanCost {
  monthly: Centavos
  totalPaid: Centavos
  totalInterest: Centavos
  /** Number of payments actually needed — fewer than the term with extras. */
  payments: number
}

/** Totals over the life of a loan, with an optional extra payment each month. */
export function loanCost(
  principal: Centavos,
  annualRatePct: number,
  termMonths: number,
  extraPerMonth: Centavos = 0,
): LoanCost {
  const rows = schedule(principal, annualRatePct, termMonths, extraPerMonth)
  const totalPaid = rows.reduce((sum, row) => sum + row.payment, 0)
  const totalInterest = rows.reduce((sum, row) => sum + row.interest, 0)

  return {
    monthly: monthlyPayment(principal, annualRatePct, termMonths) + extraPerMonth,
    totalPaid,
    totalInterest,
    payments: rows.length,
  }
}

/**
 * The schedule from a loan already part-way through: the balance that is
 * actually left, and the payment the lender actually takes.
 *
 * `schedule()` above always starts from the original principal. This one
 * starts from wherever the loan is now, which is what the detail screen and
 * the extra-payment simulator need.
 *
 * Returns an empty schedule when the payment cannot clear the month's
 * interest — the balance would grow forever, and the caller should say so
 * rather than render a table that never ends.
 */
export function remainingSchedule(
  balance: Centavos,
  annualRatePct: number,
  payment: Centavos,
  firstNumber = 1,
): Installment[] {
  if (balance <= 0 || payment <= 0) return []

  const rate = monthlyRate(annualRatePct)
  if (payment <= Math.round(balance * rate)) return []

  const rows: Installment[] = []
  let left = balance

  // A payment that clears the interest always shrinks the balance, so this
  // terminates; the cap is only a guard against a pathological rate.
  for (let n = firstNumber; left > 0 && rows.length < 1200; n++) {
    const interest = Math.round(left * rate)
    const due = Math.min(payment, left + interest)
    const principal = due - interest
    left -= principal
    rows.push({ n, payment: due, interest, principal, balance: left })
  }

  return rows
}

/** Interest handed over across the first `paymentsMade` instalments. */
export function interestPaid(
  principal: Centavos,
  annualRatePct: number,
  termMonths: number,
  paymentsMade: number,
): Centavos {
  return schedule(principal, annualRatePct, termMonths)
    .slice(0, Math.max(0, paymentsMade))
    .reduce((total, row) => total + row.interest, 0)
}

export interface ExtraPaymentEffect {
  /** Instalments left at the contracted payment. */
  basePayments: number
  /** Instalments left paying `extra` more each month. */
  payments: number
  /** How many sooner the loan finishes. */
  monthsSaved: number
  baseInterest: Centavos
  interest: Centavos
  interestSaved: Centavos
  /** False when the contracted payment does not even cover the interest. */
  amortises: boolean
}

/**
 * What paying `extra` on top of each instalment does to a loan that is
 * already running — the "what if I pay extra?" card.
 *
 * Both sides are walked from today's balance, so the answer is about the
 * money still to come rather than the loan as originally written.
 */
export function extraPaymentEffect(
  balance: Centavos,
  annualRatePct: number,
  payment: Centavos,
  extra: Centavos,
): ExtraPaymentEffect {
  const base = remainingSchedule(balance, annualRatePct, payment)
  const faster = remainingSchedule(balance, annualRatePct, payment + Math.max(0, extra))

  const sum = (rows: readonly Installment[]) =>
    rows.reduce((total, row) => total + row.interest, 0)

  const baseInterest = sum(base)
  const interest = sum(faster)

  return {
    basePayments: base.length,
    payments: faster.length,
    monthsSaved: Math.max(0, base.length - faster.length),
    baseInterest,
    interest,
    interestSaved: Math.max(0, baseInterest - interest),
    amortises: base.length > 0,
  }
}
