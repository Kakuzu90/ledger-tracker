/**
 * One formal loan (design/FormalLoan.dc.html): where it stands, the
 * amortisation table, and what paying extra would do.
 *
 * The table is the *contracted* schedule — the plan the lender wrote — while
 * the balance, the interest paid and the simulator all run off how many
 * instalments have actually been logged. Nothing is stored: both come out of
 * `src/lib/amortization.ts` every time (CLAUDE.md § Data rules).
 */

import { addMonths, format, parseISO } from 'date-fns'
import type { Account, Centavos, DateOnly, Loan, LoanPayment } from '@/db/types'
import {
  extraPaymentEffect,
  interestPaid,
  monthlyPayment,
  paidShare,
  remainingBalance,
  schedule,
  type ExtraPaymentEffect,
  type Installment,
} from '@/lib/amortization'
import { outstanding } from '@/lib/loans'
import { toDateOnly } from '@/lib/dates'
import { formatRate } from './loans'

export interface ScheduleRow extends Installment {
  date: DateOnly
  /** "Oct", or "Jan '27" where the year turns. */
  label: string
  status: 'paid' | 'due' | 'future'
}

export interface FormalView {
  loan: Loan
  /** "BDO · 9.5% a year · 60 months" */
  terms: string
  accountName?: string
  remaining: Centavos
  /** 0–1 of the principal cleared. */
  share: number
  paidCount: number
  termMonths: number
  monthly: Centavos
  interestPaid: Centavos
  /** When the next instalment falls, and which number it is. */
  nextDue?: DateOnly
  nextNumber: number
  /** "Log October payment" uses this. */
  nextLabel?: string
  payoffDate?: DateOnly
  overdue: boolean
  settled: boolean
  /**
   * False when the loan has no term, or its instalment cannot cover the
   * interest. The screen drops the table and the simulator rather than
   * drawing a schedule that never ends.
   */
  amortises: boolean
  schedule: ScheduleRow[]
}

export interface FormalInput {
  loan: Loan
  payments: readonly LoanPayment[]
  accounts: readonly Account[]
}

/** Instalment `n` falls this many months after the loan starts. */
const dueOn = (startDate: DateOnly, n: number): DateOnly =>
  toDateOnly(addMonths(parseISO(startDate), n))

function monthLabel(date: DateOnly): string {
  const parsed = parseISO(date)
  return parsed.getMonth() === 0 ? format(parsed, "MMM ''yy") : format(parsed, 'MMM')
}

export function buildFormalView(
  { loan, payments, accounts }: FormalInput,
  today: DateOnly,
): FormalView {
  const mine = payments.filter((payment) => payment.loanId === loan.id)
  const paidCount = mine.length
  const term = loan.termMonths ?? 0
  const rate = loan.ratePct ?? 0

  const rows = schedule(loan.principal, rate, term)
  const amortises = rows.length > 0

  const remaining = amortises
    ? remainingBalance(loan.principal, rate, term, paidCount)
    : outstanding(loan, mine)

  const settled = loan.status === 'settled' || remaining === 0
  const nextNumber = paidCount + 1
  const nextDue = !settled && nextNumber <= term ? dueOn(loan.startDate, nextNumber) : undefined
  const accountName = accounts.find((account) => account.id === loan.accountId)?.name

  return {
    loan,
    terms: [
      loan.lender,
      term > 0 && `${formatRate(rate)} a year`,
      term > 0 && `${term} months`,
    ]
      .filter(Boolean)
      .join(' · '),
    ...(accountName ? { accountName } : {}),
    remaining,
    share: amortises ? paidShare(loan.principal, rate, term, paidCount) : 0,
    paidCount,
    termMonths: term,
    monthly: amortises ? monthlyPayment(loan.principal, rate, term) : 0,
    interestPaid: amortises ? interestPaid(loan.principal, rate, term, paidCount) : 0,
    ...(nextDue ? { nextDue, nextLabel: format(parseISO(nextDue), 'MMMM') } : {}),
    nextNumber,
    ...(amortises && !settled
      ? { payoffDate: dueOn(loan.startDate, term) }
      : {}),
    overdue: nextDue !== undefined && nextDue < today,
    settled,
    amortises,
    schedule: rows.map((row) => {
      const date = dueOn(loan.startDate, row.n)
      return {
        ...row,
        date,
        label: monthLabel(date),
        status: row.n <= paidCount ? 'paid' : row.n === nextNumber ? 'due' : 'future',
      }
    }),
  }
}

export interface Simulation extends ExtraPaymentEffect {
  /** When the loan would finish instead. */
  payoffDate?: DateOnly
}

/** The "what if I pay extra?" card, run against where the loan stands now. */
export function simulate(view: FormalView, extra: Centavos): Simulation {
  const effect = extraPaymentEffect(
    view.remaining,
    view.loan.ratePct ?? 0,
    view.monthly,
    extra,
  )

  return {
    ...effect,
    ...(effect.payments > 0
      ? { payoffDate: dueOn(view.loan.startDate, view.paidCount + effect.payments) }
      : {}),
  }
}

/**
 * The slice of the table the card shows: the last couple of payments made,
 * the one that is due, and what follows. The whole thing is a 60-row table
 * nobody wants to scroll past.
 */
export function scheduleWindow(
  rows: readonly ScheduleRow[],
  before = 2,
  after = 3,
): ScheduleRow[] {
  const dueAt = rows.findIndex((row) => row.status === 'due')
  // Everything is paid: show the tail instead.
  if (dueAt === -1) return rows.slice(Math.max(0, rows.length - (before + after + 1)))
  return rows.slice(Math.max(0, dueAt - before), dueAt + after + 1)
}

/** Round pesos for the extra-payment slider: 0 … 10,000 in ₱500 steps. */
export const EXTRA_STEP = 500_00
export const EXTRA_MAX = 10_000_00
