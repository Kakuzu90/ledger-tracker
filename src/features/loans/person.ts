/**
 * One person's ledger (design/Person.dc.html): what they owe, loan by loan,
 * the history of every movement, and the reminder message.
 *
 * Amounts come back as numbers so the screen can render them through <Money>
 * and the "hide amounts" toggle keeps working. The reminder message is the
 * one exception — it is text meant to leave the app.
 */

import { format, parseISO } from 'date-fns'
import type {
  Account,
  Centavos,
  Contact,
  DateOnly,
  Id,
  Loan,
  LoanPayment,
} from '@/db/types'
import { isSettled, outstanding, repaid, repaidShare } from '@/lib/loans'
import { formatMoney } from '@/lib/money'
import { firstName, sentenceCase } from '@/lib/text'
import { overdueDays } from './loans'

export interface LoanCard {
  loan: Loan
  repaid: Centavos
  outstanding: Centavos
  /** 0–1 repaid. */
  share: number
  overdueDays: number
  badge: { text: string; tone: 'overdue' | 'open' | 'settled' }
  /** "Lent Sep 2 from BPI Savings · due Oct 11" */
  subtitle: string
}

export interface HistoryEntry {
  id: Id
  /** The money leaving or arriving when the loan was made, or a repayment. */
  kind: 'principal' | 'payment'
  title: string
  subtitle: string
  /** Signed for display. */
  amount: Centavos
  date: DateOnly
  /** Payments are coloured by sign; principal movements stay in ink. */
  tone: 'auto' | 'plain'
}

export interface PersonView {
  contact: Contact
  /** Positive when they owe you, negative when you owe them. */
  net: Centavos
  /** "Juan owes you", "You owe Ken", "Settled up with Juan". */
  headline: string
  openCount: number
  lent: Centavos
  borrowed: Centavos
  repaid: Centavos
  open: LoanCard[]
  settled: LoanCard[]
  history: HistoryEntry[]
  /** The draft message for the Remind button. */
  reminder: string
  /** Only worth nudging someone who owes you something. */
  canRemind: boolean
}

export interface PersonInput {
  contact: Contact
  loans: readonly Loan[]
  payments: readonly LoanPayment[]
  accounts: readonly Account[]
}

const shortDate = (date: DateOnly): string => format(parseISO(date), 'MMM d')
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

function card(
  loan: Loan,
  payments: readonly LoanPayment[],
  accountName: (id: Id | undefined) => string | undefined,
  today: DateOnly,
): LoanCard {
  const late = overdueDays(loan, payments, today)
  const settled = isSettled(loan, payments)
  const account = accountName(loan.accountId)

  const source = loan.splitFromTxnId
    ? 'from a split'
    : account
      ? `${loan.direction === 'lent' ? 'from' : 'into'} ${account}`
      : undefined

  return {
    loan,
    repaid: repaid(loan.id, payments),
    outstanding: outstanding(loan, payments),
    share: repaidShare(loan, payments),
    overdueDays: late,
    badge: settled
      ? { text: 'Settled', tone: 'settled' }
      : late > 0
        ? { text: `Overdue ${plural(late, 'day')}`, tone: 'overdue' }
        : { text: 'Open', tone: 'open' },
    subtitle: [
      `${loan.direction === 'lent' ? 'Lent' : 'Borrowed'} ${shortDate(loan.startDate)}`,
      source,
    ]
      .filter(Boolean)
      .join(' ')
      .concat(loan.dueDate ? ` · due ${shortDate(loan.dueDate)}` : ' · no due date'),
  }
}

/**
 * The message the Remind button shares. Names the single loan when there is
 * one, and the total when there are several.
 */
export function reminderMessage(
  name: string,
  loans: readonly Loan[],
  payments: readonly LoanPayment[],
  today: DateOnly,
): string {
  const owing = loans.filter(
    (loan) => loan.direction === 'lent' && !isSettled(loan, payments),
  )
  if (owing.length === 0) return ''

  const total = owing.reduce((sum, loan) => sum + outstanding(loan, payments), 0)
  const amount = formatMoney(total, { compact: true })

  const single = owing.length === 1 ? owing[0] : undefined
  const what = single ? `the ${amount} for ${sentenceCase(single.note)}` : `the ${amount} across ${plural(owing.length, 'loan')}`

  const due = single?.dueDate
    ? single.dueDate < today
      ? ` that was due ${shortDate(single.dueDate)}`
      : ` due ${shortDate(single.dueDate)}`
    : ''

  return `Hi ${firstName(name)}! Friendly reminder about ${what}${due}. Thanks!`
}

export function buildPersonView(
  { contact, loans, payments, accounts }: PersonInput,
  today: DateOnly,
): PersonView {
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const accountName = (id: Id | undefined) =>
    id === undefined ? undefined : accountById.get(id)?.name

  const mine = loans.filter((loan) => loan.contactId === contact.id)
  const cards = mine.map((loan) => card(loan, payments, accountName, today))

  // Overdue first, then the newest: the row that needs attention leads.
  const open = cards
    .filter((row) => row.badge.tone !== 'settled')
    .sort(
      (a, b) =>
        b.overdueDays - a.overdueDays || b.loan.startDate.localeCompare(a.loan.startDate),
    )
  const settled = cards
    .filter((row) => row.badge.tone === 'settled')
    .sort((a, b) => b.loan.startDate.localeCompare(a.loan.startDate))

  const net = open.reduce(
    (total, row) => total + (row.loan.direction === 'lent' ? row.outstanding : -row.outstanding),
    0,
  )

  const history: HistoryEntry[] = []
  for (const loan of mine) {
    history.push({
      id: loan.id,
      kind: 'principal',
      title: `${loan.direction === 'lent' ? 'Lent' : 'Borrowed'} · ${loan.note}`,
      subtitle: [
        shortDate(loan.startDate),
        loan.splitFromTxnId
          ? 'from a split'
          : accountName(loan.accountId) &&
            `${loan.direction === 'lent' ? 'from' : 'into'} ${accountName(loan.accountId)}`,
      ]
        .filter(Boolean)
        .join(' · '),
      amount: loan.principal,
      date: loan.startDate,
      tone: 'plain',
    })

    for (const payment of payments.filter((p) => p.loanId === loan.id)) {
      const received = loan.direction === 'lent'
      history.push({
        id: payment.id,
        kind: 'payment',
        title: received ? 'Payment received' : 'Payment sent',
        subtitle: [
          shortDate(payment.date),
          accountName(payment.accountId) &&
            `${received ? 'into' : 'from'} ${accountName(payment.accountId)}`,
          loan.note,
        ]
          .filter(Boolean)
          .join(' · '),
        amount: received ? payment.amount : -payment.amount,
        date: payment.date,
        tone: 'auto',
      })
    }
  }
  history.sort((a, b) => b.date.localeCompare(a.date))

  const sum = (
    rows: readonly LoanCard[],
    pick: (row: LoanCard) => Centavos,
  ): Centavos => rows.reduce((total, row) => total + pick(row), 0)

  const first = firstName(contact.name)
  const headline =
    net > 0 ? `${first} owes you` : net < 0 ? `You owe ${first}` : `Settled up with ${first}`

  return {
    contact,
    net,
    headline,
    openCount: open.length,
    lent: sum(
      open.filter((row) => row.loan.direction === 'lent'),
      (row) => row.loan.principal,
    ),
    borrowed: sum(
      open.filter((row) => row.loan.direction === 'borrowed'),
      (row) => row.loan.principal,
    ),
    repaid: sum(open, (row) => row.repaid),
    open,
    settled,
    history,
    reminder: reminderMessage(contact.name, mine, payments, today),
    canRemind: net > 0,
  }
}
