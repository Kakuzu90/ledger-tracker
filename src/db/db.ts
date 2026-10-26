import Dexie, { type EntityTable } from 'dexie'
import { captureChanges } from './outbox'
import type {
  Account,
  Budget,
  Category,
  Contact,
  Goal,
  Loan,
  LoanPayment,
  OutboxEntry,
  Recurring,
  Receipt,
  Setting,
  Transaction,
} from './types'

export class LedgerDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>
  categories!: EntityTable<Category, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  receipts!: EntityTable<Receipt, 'id'>
  recurring!: EntityTable<Recurring, 'id'>
  contacts!: EntityTable<Contact, 'id'>
  loans!: EntityTable<Loan, 'id'>
  loanPayments!: EntityTable<LoanPayment, 'id'>
  budgets!: EntityTable<Budget, 'id'>
  goals!: EntityTable<Goal, 'id'>
  settings!: EntityTable<Setting, 'key'>
  /** Local only: rows waiting to go to the cloud. */
  outbox!: EntityTable<OutboxEntry, 'key'>

  /** The name is a parameter so tests can open throwaway databases. */
  constructor(name = 'ledger') {
    super(name)

    // Indexes only — unindexed fields are stored all the same.
    this.version(1).stores({
      accounts: 'id, name, type, archived',
      categories: 'id, name, kind, parentId, order, archived',
      transactions:
        'id, date, type, accountId, toAccountId, categoryId, status, recurringId, loanId, *tags, [accountId+date], [categoryId+date]',
      receipts: 'id',
      recurring: 'id, nextDate, mode',
      contacts: 'id, name',
      loans: 'id, kind, direction, contactId, status, dueDate, splitFromTxnId',
      loanPayments: 'id, loanId, date, transactionId',
      budgets: 'id, month, categoryId, [month+categoryId]',
      goals: 'id, deadline',
      settings: 'key',
    })

    // Cloud sync. Nothing in v1 moves, so the upgrade is just the new
    // table appearing empty.
    this.version(2).stores({
      outbox: 'key, queuedAt',
    })

    captureChanges(this)
  }
}

export const db = new LedgerDB()

export const newId = (): string => crypto.randomUUID()

/** Stamps for a freshly created row. */
export function stamp(): { createdAt: string; updatedAt: string } {
  const now = new Date().toISOString()
  return { createdAt: now, updatedAt: now }
}

/** Stamp for a mutation. */
export function touch(): { updatedAt: string } {
  return { updatedAt: new Date().toISOString() }
}
