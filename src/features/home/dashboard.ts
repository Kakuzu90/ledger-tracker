/**
 * Everything design/Main.dc.html shows, derived from the tables in one pass.
 * Pure on purpose: the screen stays a renderer, and the figures are testable
 * against the sample data without mounting React.
 */

import type {
  Account,
  Budget,
  Category,
  Centavos,
  DateOnly,
  Id,
  Loan,
  LoanPayment,
  Recurring,
  Transaction,
} from '@/db/types'
import { categorySpend, monthTotals, netWorth, type NetWorth } from '@/lib/balances'
import { byContact, isOverdue, isSettled, loanTotals, outstanding } from '@/lib/loans'
import { paidShare, remainingBalance } from '@/lib/amortization'
import { daysLeftInMonth, daysSince, monthKey, relativeDay, toDateOnly } from '@/lib/dates'
import { ratio } from '@/lib/money'

export interface DashboardInput {
  accounts: readonly Account[]
  categories: readonly Category[]
  transactions: readonly Transaction[]
  budgets: readonly Budget[]
  loans: readonly Loan[]
  loanPayments: readonly LoanPayment[]
  recurring: readonly Recurring[]
  lastBackupAt?: string
}

export interface BudgetSummary {
  limit: Centavos
  spent: Centavos
  /** 0–1, uncapped so an over-budget month reads above 100%. */
  share: number
  /** Negative once the budget is blown. */
  remaining: Centavos
  daysLeft: number
  /** What is left per remaining day, or null when nothing is left. */
  perDay: Centavos | null
}

export interface FormalLoanSummary {
  id: Id
  title: string
  remaining: Centavos
  share: number
  color: string
}

export interface LoansSummary {
  owedToYou: Centavos
  youOwe: Centavos
  peopleOwing: number
  peopleOwed: number
  overdue: number
  /** Soonest date the user owes money by. */
  nextDue?: DateOnly
  formal: FormalLoanSummary[]
}

export interface BillSummary {
  id: Id
  title: string
  amount: Centavos
  date: DateOnly
  /** "Tomorrow · Auto-add" */
  when: string
  day: number
  color: string
}

export interface RecentRow {
  id: Id
  title: string
  subtitle: string
  /** Signed for display: negative for money leaving. */
  amount: Centavos
  /** Transfers are shown in ink rather than red or green. */
  tone: 'auto' | 'plain'
  color: string
  tileName: string
}

export interface Dashboard {
  netWorth: NetWorth
  month: { income: Centavos; expense: Centavos }
  /** "4 accounts · 1 credit card" */
  accountSummary: string
  budget: BudgetSummary | null
  loans: LoansSummary
  bills: BillSummary[]
  recent: RecentRow[]
  /** Whole days since the last backup, or null if there has never been one. */
  backupAge: number | null
}

const MUTED = '#5B616B'

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`

export function buildDashboard(input: DashboardInput, today: Date = new Date()): Dashboard {
  const {
    accounts,
    categories,
    transactions,
    budgets,
    loans,
    loanPayments,
    recurring,
    lastBackupAt,
  } = input

  const month = monthKey(today)
  const todayIso = toDateOnly(today)
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const accountById = new Map(accounts.map((a) => [a.id, a]))

  /** "Food › Groceries" for a subcategory. */
  const categoryPath = (id: Id | undefined): string | undefined => {
    const category = id ? categoryById.get(id) : undefined
    if (!category) return undefined
    const parent = category.parentId ? categoryById.get(category.parentId) : undefined
    return parent ? `${parent.name} › ${category.name}` : category.name
  }

  // ---- Accounts -----------------------------------------------------------
  const live = accounts.filter((a) => !a.archived)
  const cards = live.filter((a) => a.type === 'credit')
  const accountSummary = [
    plural(live.length - cards.length, 'account'),
    cards.length > 0 ? plural(cards.length, 'credit card') : null,
  ]
    .filter(Boolean)
    .join(' · ')

  // ---- Budget -------------------------------------------------------------
  const totals = monthTotals(transactions, month)
  const overall = budgets.find((b) => b.month === month && b.categoryId === null)

  const budget: BudgetSummary | null = overall
    ? (() => {
        const remaining = overall.limit - totals.expense
        const daysLeft = daysLeftInMonth(today)
        return {
          limit: overall.limit,
          spent: totals.expense,
          share: ratio(totals.expense, overall.limit),
          remaining,
          daysLeft,
          // Rounded to whole pesos: this is an "about", not an instruction.
          perDay: remaining > 0 ? Math.round(remaining / daysLeft / 100) * 100 : null,
        }
      })()
    : null

  // ---- Loans --------------------------------------------------------------
  const openPersonal = loans.filter(
    (loan) => loan.kind === 'personal' && !isSettled(loan, loanPayments),
  )
  const grouped = byContact(loans, loanPayments)

  const borrowedDueDates = openPersonal
    .filter((loan) => loan.direction === 'borrowed' && loan.dueDate)
    .map((loan) => loan.dueDate as DateOnly)
    .sort()

  // Dexie hands rows back in key order, which is uuid order — sort so the
  // biggest debt leads and the card does not reshuffle between loads.
  const formal: FormalLoanSummary[] = loans
    .filter((loan) => loan.kind === 'formal' && loan.status === 'open')
    .map((loan) => {
      const paid = loanPayments.filter((p) => p.loanId === loan.id).length
      const rate = loan.ratePct ?? 0
      const term = loan.termMonths ?? 0
      return {
        id: loan.id,
        title: loan.lender ? `${loan.note} · ${loan.lender}` : loan.note,
        remaining: term
          ? remainingBalance(loan.principal, rate, term, paid)
          : outstanding(loan, loanPayments),
        share: term ? paidShare(loan.principal, rate, term, paid) : 0,
        color: '#1D4E89',
      }
    })
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, 2)

  const loansSummary: LoansSummary = {
    ...loanTotals(loans, loanPayments),
    peopleOwing: [...grouped.values()].filter((entry) => entry.net > 0).length,
    peopleOwed: [...grouped.values()].filter((entry) => entry.net < 0).length,
    overdue: openPersonal.filter((loan) => isOverdue(loan, loanPayments, todayIso)).length,
    nextDue: borrowedDueDates[0],
    formal,
  }

  // ---- Upcoming bills -----------------------------------------------------
  const bills: BillSummary[] = [...recurring]
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .slice(0, 3)
    .map((rule) => ({
      id: rule.id,
      title: rule.template.note,
      amount: rule.template.amount,
      date: rule.nextDate,
      when: `${relativeDay(rule.nextDate, today)} · ${
        rule.mode === 'auto' ? 'Auto-add' : 'Ask first'
      }`,
      day: Number(rule.nextDate.slice(8, 10)),
      color: categoryById.get(rule.template.categoryId ?? '')?.color ?? MUTED,
    }))

  // ---- Recent activity ----------------------------------------------------
  const recent: RecentRow[] = [...transactions]
    .filter((txn) => txn.status === 'posted')
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)
    .map((txn) => {
      const when = relativeDay(txn.date, today)
      const account = accountById.get(txn.accountId)

      if (txn.type === 'transfer') {
        const to = txn.toAccountId ? accountById.get(txn.toAccountId) : undefined
        return {
          id: txn.id,
          title: `${account?.name ?? 'Account'} → ${to?.name ?? 'Account'}`,
          subtitle: `Transfer · ${when}`,
          amount: txn.amount,
          tone: 'plain' as const,
          color: account?.color ?? MUTED,
          tileName: 'Transfer',
        }
      }

      const label = categoryPath(txn.categoryId) ?? (txn.loanId ? 'Loan' : 'Uncategorised')
      return {
        id: txn.id,
        title: txn.note || label,
        subtitle: [label, account?.name, when].filter(Boolean).join(' · '),
        amount: txn.type === 'income' ? txn.amount : -txn.amount,
        tone: 'auto' as const,
        color: categoryById.get(txn.categoryId ?? '')?.color ?? MUTED,
        tileName: categoryById.get(txn.categoryId ?? '')?.name ?? label,
      }
    })

  return {
    netWorth: netWorth(accounts, transactions),
    month: { income: totals.income, expense: totals.expense },
    accountSummary,
    budget,
    loans: loansSummary,
    bills,
    recent,
    backupAge: lastBackupAt === undefined ? null : daysSince(lastBackupAt, today),
  }
}

/** Spend by category for the month, exposed for the budget detail link. */
export const monthCategorySpend = categorySpend
