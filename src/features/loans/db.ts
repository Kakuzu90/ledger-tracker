/**
 * Reads and writes for the loan screens.
 *
 * Every movement of money a loan causes also lands as a transaction, so the
 * account balances and the activity list stay honest without the user
 * entering anything twice (CLAUDE.md § Data rules).
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId, stamp, touch } from '@/db/db'
import type {
  Account,
  Centavos,
  Contact,
  DateOnly,
  Id,
  Loan,
  LoanDirection,
  LoanKind,
  LoanPayment,
  Transaction,
} from '@/db/types'
import { outstanding } from '@/lib/loans'
import { formatMoney } from '@/lib/money'
import { toDateOnly } from '@/lib/dates'
import { getSetting, setSetting } from '@/db/settings'
import { loanReminderText, notify } from '@/lib/notifications'
import { loansDueSoon } from './loans'

export interface LoansData {
  contacts: Contact[]
  loans: Loan[]
  payments: LoanPayment[]
  accounts: Account[]
}

/** Everything the hub and the New loan form read. */
export function useLoansData(): LoansData | undefined {
  return useLiveQuery(async () => {
    const [contacts, loans, payments, accounts] = await Promise.all([
      db.contacts.toArray(),
      db.loans.toArray(),
      db.loanPayments.toArray(),
      db.accounts.toArray(),
    ])
    return {
      contacts: contacts.sort((a, b) => a.name.localeCompare(b.name)),
      loans,
      payments,
      accounts: accounts.filter((account) => !account.archived),
    }
  }, [])
}

export interface PersonData extends LoansData {
  /** null when the contact has been removed. */
  contact: Contact | null
}

export function usePersonData(contactId: Id | undefined): PersonData | undefined {
  return useLiveQuery(async () => {
    if (!contactId) return { contact: null, contacts: [], loans: [], payments: [], accounts: [] }

    const [contact, loans, payments, accounts] = await Promise.all([
      db.contacts.get(contactId),
      db.loans.where('contactId').equals(contactId).toArray(),
      db.loanPayments.toArray(),
      db.accounts.toArray(),
    ])

    const mine = new Set(loans.map((loan) => loan.id))
    return {
      contact: contact ?? null,
      contacts: contact ? [contact] : [],
      loans,
      payments: payments.filter((payment) => mine.has(payment.loanId)),
      accounts,
    }
  }, [contactId])
}

export interface FormalLoanData {
  /** null once the loan has been deleted. */
  loan: Loan | null
  payments: LoanPayment[]
  accounts: Account[]
}

export function useFormalLoan(loanId: Id | undefined): FormalLoanData | undefined {
  return useLiveQuery(async () => {
    if (!loanId) return { loan: null, payments: [], accounts: [] }

    const [loan, payments, accounts] = await Promise.all([
      db.loans.get(loanId),
      db.loanPayments.where('loanId').equals(loanId).toArray(),
      db.accounts.toArray(),
    ])

    return {
      loan: loan ?? null,
      payments: payments.sort((a, b) => (a.installmentNo ?? 0) - (b.installmentNo ?? 0)),
      accounts,
    }
  }, [loanId])
}

export async function createContact(name: string, phone?: string): Promise<Id> {
  const trimmed = name.trim()
  if (trimmed === '') throw new Error('Give the person a name')

  const contact: Contact = {
    id: newId(),
    name: trimmed,
    ...(phone?.trim() ? { phone: phone.trim() } : {}),
    note: '',
    ...stamp(),
  }
  await db.contacts.add(contact)
  return contact.id
}

export interface LoanDraft {
  kind: LoanKind
  direction: LoanDirection
  contactId?: Id
  lender?: string
  principal: Centavos
  ratePct?: number
  termMonths?: number
  startDate: DateOnly
  dueDate?: DateOnly
  note: string
  /** Personal: where the money moved. Formal: where instalments come from. */
  accountId?: Id
  /**
   * Personal loans only: move the principal through `accountId`. Off when the
   * money changed hands outside the ledger — cash from a drawer, say.
   */
  moveMoney?: boolean
}

/**
 * Writes a loan and, for a personal loan drawn from an account, the
 * transaction that moved the principal.
 *
 * A formal loan books no transaction: the bank paid the dealer, not you. Its
 * instalments are what touches your accounts, and `recordPayment` writes
 * those.
 */
export async function createLoan(draft: LoanDraft): Promise<Id> {
  if (draft.principal <= 0) throw new Error('Enter how much the loan is for')
  if (draft.kind === 'personal' && !draft.contactId) throw new Error('Choose who it is with')
  if (draft.kind === 'formal' && !draft.lender?.trim()) throw new Error('Name the lender')

  const { moveMoney = false, ...fields } = draft
  const loan: Loan = {
    id: newId(),
    ...fields,
    note: draft.note.trim(),
    ...(draft.lender ? { lender: draft.lender.trim() } : {}),
    status: 'open',
    ...stamp(),
  }

  await db.transaction('rw', db.loans, db.transactions, async () => {
    await db.loans.add(loan)

    if (loan.kind === 'personal' && moveMoney && loan.accountId) {
      const movement: Transaction = {
        id: newId(),
        // Lending puts money out of your pocket; borrowing puts it in.
        type: loan.direction === 'lent' ? 'expense' : 'income',
        amount: loan.principal,
        accountId: loan.accountId,
        date: loan.startDate,
        note: loan.note,
        tags: [],
        loanId: loan.id,
        status: 'posted',
        ...stamp(),
      }
      await db.transactions.add(movement)
    }
  })

  return loan.id
}

/**
 * Edits a loan in place. The principal movement it may have booked is left
 * alone: that transaction is history, and rewriting it would quietly move an
 * account balance under the user.
 */
export async function updateLoan(id: Id, draft: LoanDraft): Promise<void> {
  if (draft.principal <= 0) throw new Error('Enter how much the loan is for')
  if (draft.kind === 'formal' && !draft.lender?.trim()) throw new Error('Name the lender')

  const fields: Partial<LoanDraft> = { ...draft }
  // A toggle about the original movement; it is not a field on the loan.
  delete fields.moveMoney

  await db.loans.update(id, {
    ...fields,
    note: draft.note.trim(),
    ...(draft.lender ? { lender: draft.lender.trim() } : {}),
    ...touch(),
  })
}

export interface PaymentInput {
  loanId: Id
  amount: Centavos
  date: DateOnly
  /** The account the money lands in, or leaves from. */
  accountId: Id
  /** Formal loans number their instalments. */
  installmentNo?: number
}

/**
 * Records a partial or full repayment: a `loanPayments` row, the transaction
 * that mirrors it, and — when nothing is left — the loan closing itself.
 */
export async function recordPayment(input: PaymentInput): Promise<Id> {
  if (input.amount <= 0) throw new Error('Enter how much was paid')

  return db.transaction('rw', db.loans, db.loanPayments, db.transactions, async () => {
    const loan = await db.loans.get(input.loanId)
    if (!loan) throw new Error('That loan no longer exists')

    const payments = await db.loanPayments.where('loanId').equals(loan.id).toArray()
    const left = outstanding(loan, payments)

    // Formal loans amortise, so principal-less-payments is not their ceiling;
    // a personal loan has no interest and cannot take more than it is owed.
    if (loan.kind === 'personal' && input.amount > left) {
      throw new Error(`That is more than the ${formatMoney(left, { compact: true })} left`)
    }

    const received = loan.direction === 'lent'
    const transaction: Transaction = {
      id: newId(),
      type: received ? 'income' : 'expense',
      amount: input.amount,
      accountId: input.accountId,
      date: input.date,
      note: `Repayment · ${loan.note}`,
      tags: [],
      loanId: loan.id,
      status: 'posted',
      ...stamp(),
    }
    await db.transactions.add(transaction)

    const payment: LoanPayment = {
      id: newId(),
      loanId: loan.id,
      amount: input.amount,
      date: input.date,
      accountId: input.accountId,
      transactionId: transaction.id,
      ...(input.installmentNo !== undefined ? { installmentNo: input.installmentNo } : {}),
      ...stamp(),
    }
    await db.loanPayments.add(payment)

    if (loan.kind === 'personal' && input.amount >= left) {
      await db.loans.update(loan.id, { status: 'settled', ...touch() })
    }

    return payment.id
  })
}

/**
 * Takes a payment back out: the row, its transaction, and the settled flag it
 * may have set. This is the only way to undo one — `deleteTransaction`
 * refuses loan payments precisely so they are unwound from here.
 */
export async function deletePayment(paymentId: Id): Promise<void> {
  await db.transaction('rw', db.loans, db.loanPayments, db.transactions, async () => {
    const payment = await db.loanPayments.get(paymentId)
    if (!payment) return

    await db.loanPayments.delete(payment.id)
    await db.transactions.delete(payment.transactionId)

    const loan = await db.loans.get(payment.loanId)
    if (loan?.status === 'settled') {
      await db.loans.update(loan.id, { status: 'open', ...touch() })
    }
  })
}

/**
 * Closes loans without recording any money — for a debt written off, or one
 * squared away outside the app. The ids come back so it can be undone.
 */
export async function settleLoans(ids: readonly Id[]): Promise<Id[]> {
  const closed: Id[] = []
  await db.transaction('rw', db.loans, async () => {
    for (const id of ids) {
      const loan = await db.loans.get(id)
      if (!loan || loan.status === 'settled') continue
      await db.loans.update(id, { status: 'settled', ...touch() })
      closed.push(id)
    }
  })
  return closed
}

export async function reopenLoans(ids: readonly Id[]): Promise<void> {
  await db.transaction('rw', db.loans, async () => {
    for (const id of ids) {
      await db.loans.update(id, { status: 'open', ...touch() })
    }
  })
}

/**
 * Removes a loan and the principal movement it booked. Refused once money has
 * been repaid against it — that history belongs to the account balances.
 */
export async function deleteLoan(id: Id): Promise<void> {
  await db.transaction('rw', db.loans, db.loanPayments, db.transactions, async () => {
    const payments = await db.loanPayments.where('loanId').equals(id).count()
    if (payments > 0) {
      throw new Error('Settle it instead — payments have already been recorded against it')
    }

    await db.transactions.where('loanId').equals(id).delete()
    await db.loans.delete(id)
  })
}

/**
 * Raises a notice for a loan coming due, once a day, when the user asked
 * for it. Same shape as the bill reminder: it fires on open, because that
 * is the only moment an app with no push server gets.
 */
export async function remindAboutLoans(today: Date = new Date()): Promise<boolean> {
  if (!(await getSetting('loanReminders', false))) return false

  const todayIso = toDateOnly(today)
  if ((await getSetting<string | null>('lastLoanNotice', null)) === todayIso) return false

  const [contacts, loans, payments] = await Promise.all([
    db.contacts.toArray(),
    db.loans.toArray(),
    db.loanPayments.toArray(),
  ])

  const due = loansDueSoon({ contacts, loans, payments }, todayIso)
  if (due.length === 0) return false

  await setSetting('lastLoanNotice', todayIso)
  return notify('Ledger', loanReminderText(due), 'ledger-loans')
}
