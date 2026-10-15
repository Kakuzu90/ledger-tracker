/**
 * Loan remainders are computed from payments — never stored
 * (CLAUDE.md § Data rules).
 */

import type { Centavos, Id, Loan, LoanPayment, RateBasis } from '@/db/types'
import { sumMoney } from './money'

export function repaid(loanId: Id, payments: readonly LoanPayment[]): Centavos {
  return sumMoney(payments.filter((p) => p.loanId === loanId).map((p) => p.amount))
}

/** Never below zero: an overpayment settles a loan, it does not invert it. */
export function outstanding(loan: Loan, payments: readonly LoanPayment[]): Centavos {
  return Math.max(0, loan.principal - repaid(loan.id, payments))
}

/** 0–1 share of the principal repaid. */
export function repaidShare(loan: Loan, payments: readonly LoanPayment[]): number {
  if (loan.principal === 0) return 1
  return Math.min(1, repaid(loan.id, payments) / loan.principal)
}

export function isSettled(loan: Loan, payments: readonly LoanPayment[]): boolean {
  return loan.status === 'settled' || outstanding(loan, payments) === 0
}

/** Open and past its due date, as of `today` (YYYY-MM-DD). */
export function isOverdue(
  loan: Loan,
  payments: readonly LoanPayment[],
  today: string,
): boolean {
  if (!loan.dueDate || isSettled(loan, payments)) return false
  return loan.dueDate < today
}

export interface LoanTotals {
  /** Open principal others owe the user. */
  owedToYou: Centavos
  /** Open principal the user owes. */
  youOwe: Centavos
  /** owedToYou − youOwe */
  net: Centavos
}

/**
 * The "owed to you / you owe" cards on the loans screen. Personal loans only —
 * formal loans have their own section there, and their remaining balance is an
 * amortised figure rather than principal less payments.
 */
export function loanTotals(
  loans: readonly Loan[],
  payments: readonly LoanPayment[],
): LoanTotals {
  let owedToYou = 0
  let youOwe = 0

  for (const loan of loans) {
    if (loan.kind !== 'personal' || isSettled(loan, payments)) continue
    const left = outstanding(loan, payments)
    if (loan.direction === 'lent') owedToYou += left
    else youOwe += left
  }

  return { owedToYou, youOwe, net: owedToYou - youOwe }
}

/** Open loans grouped by contact, for the people list. */
export function byContact(
  loans: readonly Loan[],
  payments: readonly LoanPayment[],
): Map<Id, { loans: Loan[]; net: Centavos }> {
  const grouped = new Map<Id, { loans: Loan[]; net: Centavos }>()

  for (const loan of loans) {
    if (loan.contactId === undefined || isSettled(loan, payments)) continue
    const entry = grouped.get(loan.contactId) ?? { loans: [], net: 0 }
    const left = outstanding(loan, payments)
    entry.loans.push(loan)
    entry.net += loan.direction === 'lent' ? left : -left
    grouped.set(loan.contactId, entry)
  }

  return grouped
}

/**
 * Rates are quoted per month by most lenders here and per year by the
 * amortisation maths, so the form takes one and stores the other.
 *
 * Kept as a plain ×12 — the nominal conversion the lender means by "3.95%
 * a month", not an effective rate, which would compound to a different
 * number and not match the contract.
 */
export const toAnnualRate = (rate: number, basis: RateBasis): number =>
  basis === 'month' ? rate * 12 : rate

export const fromAnnualRate = (annualRate: number, basis: RateBasis): number =>
  basis === 'month' ? annualRate / 12 : annualRate

/** "3.95% a month", or "9.5% a year". */
export function rateLabel(annualRate: number, basis: RateBasis = 'year'): string {
  const shown = fromAnnualRate(annualRate, basis)
  // Trailing zeros read as false precision on a rate someone typed.
  const digits = Number.isInteger(shown) ? 0 : 2
  return `${shown.toFixed(digits)}% a ${basis}`
}
