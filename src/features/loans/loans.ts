/**
 * The loans hub as data (design/Loans.dc.html): the two totals, the filter
 * chips, the people list and the formal loans.
 *
 * Nothing here is stored — what is still owed is always principal less
 * payments, or the amortised balance for a formal loan (CLAUDE.md § Data
 * rules).
 */

import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { Centavos, Contact, DateOnly, Id, Loan, LoanPayment, RateBasis } from '@/db/types'
import { fromAnnualRate } from '@/lib/loans'
import { isOverdue, isSettled, loanTotals, outstanding, type LoanTotals } from '@/lib/loans'
import { paidShare, remainingBalance } from '@/lib/amortization'

export type LoanFilter = 'all' | 'lent' | 'borrowed' | 'overdue' | 'settled'

export const FILTERS: ReadonlyArray<{ value: LoanFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'lent', label: 'Lent' },
  { value: 'borrowed', label: 'Borrowed' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'settled', label: 'Settled' },
]

export interface PersonRow {
  contact: Contact
  /** The loans this row stands for, under the current filter. */
  loans: Loan[]
  /** Positive when they owe you, negative when you owe them. */
  net: Centavos
  /** "2 loans", "Due Oct 30", "From split · Dinner". */
  subtitle: string
  /** Whole days past the earliest due date; 0 when nothing is overdue. */
  overdueDays: number
}

export interface FormalRow {
  loan: Loan
  /** "Car loan · BDO" */
  title: string
  /** "9.5% · 24 of 60 paid" */
  subtitle: string
  remaining: Centavos
  /** 0–1 of the principal cleared. */
  share: number
}

export interface LoansView {
  totals: LoanTotals
  people: PersonRow[]
  formal: FormalRow[]
  /** Chip badge counts, taken from every loan rather than the filtered set. */
  overdueCount: number
  settledCount: number
  /** Open personal loans, for the "4 open" caption. */
  openPersonalCount: number
}

export interface LoansInput {
  contacts: readonly Contact[]
  loans: readonly Loan[]
  payments: readonly LoanPayment[]
}

const shortDate = (date: DateOnly): string => format(parseISO(date), 'MMM d')

/**
 * `9.5` → `"9.5%"`. With a monthly basis the stored annual figure is
 * shown back the way it was quoted: 47.4 stored → `"3.95%/mo"`.
 */
export const formatRate = (ratePct: number, basis: RateBasis = 'year'): string => {
  const shown = fromAnnualRate(ratePct, basis)
  return `${Number(shown.toFixed(2))}%${basis === 'month' ? '/mo' : ''}`
}

/** Whole days a loan is past due, as of `today`. 0 when it is not. */
export function overdueDays(
  loan: Loan,
  payments: readonly LoanPayment[],
  today: DateOnly,
): number {
  if (!isOverdue(loan, payments, today)) return 0
  return differenceInCalendarDays(parseISO(today), parseISO(loan.dueDate as DateOnly))
}

/** What is still owed on a formal loan: amortised when it carries a rate. */
export function formalRemaining(loan: Loan, payments: readonly LoanPayment[]): Centavos {
  const paid = payments.filter((p) => p.loanId === loan.id).length
  const term = loan.termMonths ?? 0
  if (term <= 0) return outstanding(loan, payments)
  return remainingBalance(loan.principal, loan.ratePct ?? 0, term, paid)
}

/** The loans a filter chip selects. */
export function selectLoans(
  loans: readonly Loan[],
  payments: readonly LoanPayment[],
  filter: LoanFilter,
  today: DateOnly,
): Loan[] {
  return loans.filter((loan) => {
    const settled = isSettled(loan, payments)
    if (filter === 'settled') return settled
    if (settled) return false
    if (filter === 'lent') return loan.direction === 'lent'
    if (filter === 'borrowed') return loan.direction === 'borrowed'
    if (filter === 'overdue') return isOverdue(loan, payments, today)
    return true
  })
}

function personSubtitle(loans: readonly Loan[]): string {
  if (loans.length !== 1) return `${loans.length} loans`

  const [loan] = loans
  if (!loan) return ''
  if (loan.splitFromTxnId) return `From split · ${loan.note}`
  if (loan.dueDate) return `Due ${shortDate(loan.dueDate)}`
  return loan.note || 'No due date'
}

/**
 * Builds the screen. `filter` only narrows the lists — the totals card above
 * them always speaks for every open loan.
 */
export function buildLoansView(
  { contacts, loans, payments }: LoansInput,
  today: DateOnly,
  filter: LoanFilter = 'all',
): LoansView {
  const selected = selectLoans(loans, payments, filter, today)
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]))

  const grouped = new Map<Id, Loan[]>()
  for (const loan of selected) {
    if (loan.kind !== 'personal' || loan.contactId === undefined) continue
    const list = grouped.get(loan.contactId) ?? []
    list.push(loan)
    grouped.set(loan.contactId, list)
  }

  const people: PersonRow[] = []
  for (const [contactId, group] of grouped) {
    const contact = contactById.get(contactId)
    if (!contact) continue

    const net = group.reduce((total, loan) => {
      const left = outstanding(loan, payments)
      return total + (loan.direction === 'lent' ? left : -left)
    }, 0)

    people.push({
      contact,
      loans: group,
      net,
      subtitle: personSubtitle(group),
      overdueDays: Math.max(...group.map((loan) => overdueDays(loan, payments, today)), 0),
    })
  }

  // Loudest first: overdue, then the largest sum at stake.
  people.sort(
    (a, b) => b.overdueDays - a.overdueDays || Math.abs(b.net) - Math.abs(a.net),
  )

  const formal: FormalRow[] = selected
    .filter((loan) => loan.kind === 'formal')
    .map((loan) => {
      const paid = payments.filter((p) => p.loanId === loan.id).length
      const term = loan.termMonths ?? 0
      return {
        loan,
        title: loan.lender ? `${loan.note} · ${loan.lender}` : loan.note,
        subtitle: term
          ? `${formatRate(loan.ratePct ?? 0, loan.rateBasis)} · ${paid} of ${term} paid`
          : formatRate(loan.ratePct ?? 0, loan.rateBasis),
        remaining: formalRemaining(loan, payments),
        share: term ? paidShare(loan.principal, loan.ratePct ?? 0, term, paid) : 0,
      }
    })
    .sort((a, b) => b.remaining - a.remaining)

  const openPersonal = loans.filter(
    (loan) => loan.kind === 'personal' && !isSettled(loan, payments),
  )

  return {
    totals: loanTotals(loans, payments),
    people,
    formal,
    overdueCount: openPersonal.filter((loan) => isOverdue(loan, payments, today)).length,
    settledCount: loans.filter((loan) => isSettled(loan, payments)).length,
    openPersonalCount: openPersonal.length,
  }
}

/**
 * Names for the loan reminder: anything due within `days`, and anything
 * already past its date. A personal loan is named after the person, a formal
 * one after the loan, because that is what the reader will recognise.
 */
export function loansDueSoon(
  { contacts, loans, payments }: LoansInput,
  today: DateOnly,
  days = 1,
): string[] {
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]))
  const horizon = format(addDays(parseISO(today), days), 'yyyy-MM-dd')

  return loans
    .filter((loan) => loan.dueDate !== undefined && loan.dueDate <= horizon)
    .filter((loan) => !isSettled(loan, payments))
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    .map((loan) =>
      loan.kind === 'personal'
        ? (contactById.get(loan.contactId ?? '')?.name ?? loan.note)
        : loan.note,
    )
}
