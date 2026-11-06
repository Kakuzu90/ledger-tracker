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
  monthlyPayment,
  remainingSchedule,
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
  /**
   * The lender's instalment was entered and it is too small to cover the
   * monthly interest, so the balance would only grow. Worth saying out
   * loud: it is far more likely to be a typo than a real loan.
   */
  paymentTooSmall: boolean
  schedule: ScheduleRow[]
}

export interface FormalInput {
  loan: Loan
  payments: readonly LoanPayment[]
  accounts: readonly Account[]
}

/**
 * When instalment `n` falls. `startDate` is the first payment, so number 1
 * lands on it rather than a month later — the field says "First payment"
 * and it has to mean that.
 */
const dueOn = (startDate: DateOnly, n: number): DateOnly =>
  toDateOnly(addMonths(parseISO(startDate), n - 1))

function monthLabel(date: DateOnly): string {
  const parsed = parseISO(date)
  return parsed.getMonth() === 0 ? format(parsed, "MMM ''yy") : format(parsed, 'MMM')
}

/**
 * Which instalments have actually been paid, by number.
 *
 * Marking the first `paidCount` rows instead would renumber the table
 * when a payment is undone from the middle: undo number 12 of 24 and
 * rows 1–23 would light up, hiding the very hole that needs filling.
 *
 * A payment with no number against it — nothing in the app writes one
 * that way now, but a hand-restored row might — falls back to filling
 * from the start, which is what the table used to do for all of them.
 */
function paidInstalments(payments: readonly LoanPayment[], length: number): Set<number> {
  const numbered = new Set<number>()
  for (const payment of payments) {
    if (payment.installmentNo !== undefined) numbered.add(payment.installmentNo)
  }

  let unnumbered = payments.length - numbered.size
  for (let n = 1; n <= length && unnumbered > 0; n++) {
    if (numbered.has(n)) continue
    numbered.add(n)
    unnumbered--
  }

  return numbered
}

/** The lowest instalment not yet paid, or one past the end when all are. */
function firstUnpaid(paid: ReadonlySet<number>, instalments: number, paidCount: number): number {
  for (let n = 1; n <= instalments; n++) {
    if (!paid.has(n)) return n
  }
  // No schedule to go by — a loan that does not amortise still counts.
  return Math.max(instalments, paidCount) + 1
}

export function buildFormalView(
  { loan, payments, accounts }: FormalInput,
  today: DateOnly,
): FormalView {
  const mine = payments.filter((payment) => payment.loanId === loan.id)
  const paidCount = mine.length
  const term = loan.termMonths ?? 0
  const rate = loan.ratePct ?? 0

  // Two ways to get a schedule. With the lender's own instalment the
  // length falls out of the arithmetic — their payment is rarely the one
  // the term implies, and following it is the whole point of entering it.
  // Without it, the term is what sets the payment.
  const fixed = loan.monthlyPayment ?? 0
  const rows =
    fixed > 0
      ? remainingSchedule(loan.principal, rate, fixed)
      : schedule(loan.principal, rate, term)
  const amortises = rows.length > 0
  const paymentTooSmall = fixed > 0 && rows.length === 0 && loan.principal > 0

  // Everything below reads off those rows rather than recomputing, so the
  // figures agree with the table whichever way it was built.
  const remaining = amortises
    ? paidCount === 0
      ? loan.principal
      : (rows[paidCount - 1]?.balance ?? 0)
    : outstanding(loan, mine)

  const instalments = amortises ? rows.length : term
  const settled = loan.status === 'settled' || remaining === 0
  const paidNumbers = paidInstalments(mine, rows.length)
  // The first one still owing, which is not `paidCount + 1` once a
  // payment has been undone out of the middle. Logging the next one
  // should fill that hole rather than add to the end.
  const nextNumber = firstUnpaid(paidNumbers, instalments, paidCount)
  const nextDue =
    !settled && nextNumber <= instalments ? dueOn(loan.startDate, nextNumber) : undefined
  const accountName = accounts.find((account) => account.id === loan.accountId)?.name

  return {
    loan,
    terms: [
      loan.lender,
      instalments > 0 && `${formatRate(rate)} a year`,
      instalments > 0 && `${instalments} months`,
    ]
      .filter(Boolean)
      .join(' · '),
    ...(accountName ? { accountName } : {}),
    remaining,
    share: loan.principal > 0 ? (loan.principal - remaining) / loan.principal : 0,
    paidCount,
    termMonths: instalments,
    // The lender's figure wins wherever it was given, including when it
    // is too small to amortise — the Log button still has to offer it.
    monthly: fixed > 0 ? fixed : amortises ? monthlyPayment(loan.principal, rate, term) : 0,
    interestPaid: rows
      .slice(0, paidCount)
      .reduce((total, row) => total + row.interest, 0),
    ...(nextDue ? { nextDue, nextLabel: format(parseISO(nextDue), 'MMMM') } : {}),
    nextNumber,
    ...(amortises && !settled ? { payoffDate: dueOn(loan.startDate, instalments) } : {}),
    overdue: nextDue !== undefined && nextDue < today,
    settled,
    amortises,
    paymentTooSmall,
    schedule: rows.map((row) => {
      const date = dueOn(loan.startDate, row.n)
      return {
        ...row,
        date,
        label: monthLabel(date),
        status: paidNumbers.has(row.n) ? 'paid' : row.n === nextNumber ? 'due' : 'future',
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
