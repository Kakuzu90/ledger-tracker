/**
 * Dexie schema v1 (see CLAUDE.md § Dexie schema).
 *
 * Money is always an integer number of centavos — never a float.
 * Every row carries `id` (uuid), `createdAt` and `updatedAt` (ISO strings).
 * Balances, loan remainders and budget spend are computed, never stored.
 */

export type Id = string
/** ISO-8601 instant, e.g. 2026-10-14T09:12:00.000Z */
export type Timestamp = string
/** Calendar day, YYYY-MM-DD */
export type DateOnly = string
/** Month key, YYYY-MM */
export type MonthKey = string
/** Integer centavos. */
export type Centavos = number

export interface Row {
  id: Id
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type AccountType = 'cash' | 'bank' | 'ewallet' | 'credit'

export interface Account extends Row {
  name: string
  type: AccountType
  currency: string
  openingBalance: Centavos
  color: string
  archived: boolean
  creditLimit?: Centavos
  /** Day of month the statement closes (credit cards). */
  statementDay?: number
  /** Day of month payment is due (credit cards). */
  dueDay?: number
}

export type CategoryKind = 'expense' | 'income'

export interface Category extends Row {
  name: string
  kind: CategoryKind
  parentId?: Id
  color: string
  order: number
  archived: boolean
}

export type TransactionType = 'expense' | 'income' | 'transfer'
export type TransactionStatus = 'posted' | 'pending'

export interface Transaction extends Row {
  type: TransactionType
  amount: Centavos
  accountId: Id
  /** Destination account for transfers. */
  toAccountId?: Id
  categoryId?: Id
  date: DateOnly
  note: string
  tags: string[]
  receiptId?: Id
  /** Set when generated from a recurring template. */
  recurringId?: Id
  /** Set when this transaction is the ledger side of a loan movement. */
  loanId?: Id
  status: TransactionStatus
}

export interface Receipt extends Row {
  blob: Blob
  mime: string
  size: number
}

export type RecurringFreq = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type RecurringMode = 'auto' | 'confirm'

/** The transaction fields a recurring rule stamps out. */
export type RecurringTemplate = Pick<
  Transaction,
  'type' | 'amount' | 'accountId' | 'note' | 'tags'
> &
  Partial<Pick<Transaction, 'toAccountId' | 'categoryId'>>

export interface Recurring extends Row {
  template: RecurringTemplate
  freq: RecurringFreq
  /** Every `interval` units of `freq`. */
  interval: number
  startDate: DateOnly
  endDate?: DateOnly
  nextDate: DateOnly
  mode: RecurringMode
}

export interface Contact extends Row {
  name: string
  phone?: string
  note?: string
}

export type LoanKind = 'personal' | 'formal'
export type LoanDirection = 'lent' | 'borrowed'
export type LoanStatus = 'open' | 'settled'

export interface Loan extends Row {
  kind: LoanKind
  direction: LoanDirection
  /** Personal loans point at a contact. */
  contactId?: Id
  /** Formal loans name an institution. */
  lender?: string
  principal: Centavos
  /** Nominal annual rate, percent. */
  ratePct?: number
  termMonths?: number
  startDate: DateOnly
  dueDate?: DateOnly
  note: string
  accountId?: Id
  status: LoanStatus
  /** Set when the loan was created by splitting a transaction. */
  splitFromTxnId?: Id
}

export interface LoanPayment extends Row {
  loanId: Id
  amount: Centavos
  date: DateOnly
  accountId?: Id
  /** Every payment mirrors into a transaction. */
  transactionId: Id
  /** 1-based installment number for formal loans. */
  installmentNo?: number
}

export interface Budget extends Row {
  month: MonthKey
  /** null = the overall month budget. */
  categoryId: Id | null
  limit: Centavos
  rollover: boolean
}

export interface Goal extends Row {
  name: string
  target: Centavos
  saved: Centavos
  deadline?: DateOnly
}

export interface Setting<T = unknown> {
  key: string
  value: T
}
