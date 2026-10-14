/**
 * Demo dataset. Deterministic: the same `today` always produces the same rows,
 * so tests can assert on it and screenshots do not drift between runs.
 *
 * The headline figures reproduce design/*.dc.html — net worth ₱64,250, October
 * income ₱52,000 against ₱31,480 spent, ₱12,500 owed to the user and ₱4,000
 * owed by them — so a freshly seeded app looks like the mockups. Those numbers
 * hold when `today` is the 13th or later of the month; earlier in a month there
 * is simply less of it to show, and every figure stays internally consistent
 * because opening balances are solved from the generated history.
 */

import { addDays, addMonths, format, lastDayOfMonth, parseISO, subMonths } from 'date-fns'
import type { LedgerDB } from './db'
import { db as defaultDb, newId, stamp } from './db'
import { buildDefaultCategories } from './seed'
import type {
  Account,
  Budget,
  Category,
  Centavos,
  Contact,
  DateOnly,
  Goal,
  Id,
  Loan,
  LoanPayment,
  Receipt,
  Recurring,
  Setting,
  Transaction,
} from './types'
import { accountDelta } from '@/lib/balances'
import { allocateByWeight } from '@/lib/money'

export interface SampleData {
  accounts: Account[]
  categories: Category[]
  contacts: Contact[]
  transactions: Transaction[]
  loans: Loan[]
  loanPayments: LoanPayment[]
  budgets: Budget[]
  goals: Goal[]
  recurring: Recurring[]
  receipts: Receipt[]
  settings: Setting[]
}

/** Target balance for each account today; opening balances are solved to match. */
const ACCOUNTS: ReadonlyArray<
  Omit<Account, 'id' | 'openingBalance' | 'createdAt' | 'updatedAt'> & {
    balance: Centavos
  }
> = [
  { name: 'BPI Savings', type: 'bank', currency: 'PHP', color: '#1D4E89', archived: false, balance: 58_420_00 },
  { name: 'Maya', type: 'ewallet', currency: 'PHP', color: '#0F6E64', archived: false, balance: 16_750_00 },
  { name: 'GCash', type: 'ewallet', currency: 'PHP', color: '#2C6E8A', archived: false, balance: 6_310_00 },
  { name: 'Cash', type: 'cash', currency: 'PHP', color: '#7A6A3F', archived: false, balance: 3_250_00 },
  {
    name: 'BPI Visa',
    type: 'credit',
    currency: 'PHP',
    color: '#8A2452',
    archived: false,
    creditLimit: 60_000_00,
    statementDay: 5,
    dueDay: 25,
    balance: -20_480_00,
  },
  { name: 'Old PayMaya', type: 'ewallet', currency: 'PHP', color: '#5B616B', archived: true, balance: 0 },
  { name: 'Coins.ph', type: 'ewallet', currency: 'PHP', color: '#5B616B', archived: true, balance: 0 },
]

/** Spend per category this month — these sum to the ₱31,480 on the dashboard. */
const CURRENT_MONTH_SPEND: Readonly<Record<string, Centavos>> = {
  Bills: 9_200_00,
  Food: 8_940_00,
  Shopping: 3_960_00,
  Entertainment: 2_400_00,
  Home: 2_200_00,
  Transport: 2_180_00,
  Personal: 1_200_00,
  Gifts: 800_00,
  Health: 600_00,
}

/**
 * Total spend per month, oldest first, ending with the current month. Chosen so
 * the six-month average saved lands on the ₱17,387 in design/Reports.dc.html.
 */
const MONTHLY_SPEND: readonly Centavos[] = [
  34_900_00,
  36_100_00,
  33_800_00,
  37_200_00,
  34_198_00,
  31_480_00,
]

/** Semi-monthly payroll. Two of these make the ₱52,000 monthly income. */
const SALARY = 26_000_00
const PAYROLL_DAYS = [1, 13] as const

const NOTES: Readonly<Record<string, readonly string[]>> = {
  Food: ['Jollibee', 'Coffee run', 'Market haul', 'Milk tea', 'Bakery', 'Street food'],
  Transport: ['Grab home', 'Jeep fare', 'MRT load', 'Gas', 'Parking'],
  Bills: ['Mobile plan', 'Cable', 'Water', 'Association dues'],
  Shopping: ['Uniqlo', 'Shopee order', 'Hardware store', 'Shoes'],
  Health: ['Pharmacy', 'Clinic visit', 'Vitamins'],
  Home: ['Cleaning supplies', 'Light bulbs', 'Plant pots'],
  Entertainment: ['Cinema', 'Concert tickets', 'Board game night'],
  Personal: ['Haircut', 'Gym day pass', 'Skincare'],
  Gifts: ['Birthday gift', 'Wedding gift', 'Christmas shopping'],
  Education: ['Online course', 'Textbook'],
  Other: ['Misc'],
}

/** Which account usually pays for what, by weight. */
const PAYERS: Readonly<Record<string, readonly [string, number][]>> = {
  Food: [['GCash', 3], ['Cash', 2], ['BPI Visa', 1]],
  Transport: [['GCash', 4], ['Cash', 2]],
  Bills: [['BPI Savings', 4], ['BPI Visa', 1]],
  Shopping: [['BPI Visa', 3], ['GCash', 1]],
  Health: [['Cash', 1], ['GCash', 1]],
  Home: [['Cash', 2], ['GCash', 1]],
  Entertainment: [['BPI Visa', 2], ['GCash', 1]],
  Personal: [['Cash', 1], ['GCash', 1]],
  Gifts: [['BPI Visa', 1], ['GCash', 1]],
}

const TAGS: readonly string[] = ['japan-trip', 'work', 'household', 'weekly', 'gifts', 'date-night']

/** A 1x1 PNG. Stands in for a photographed receipt. */
const PLACEHOLDER_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

/** mulberry32 — small, seeded, good enough for placing sample rows. */
function rng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const iso = (date: Date): DateOnly => format(date, 'yyyy-MM-dd')

export interface SampleOptions {
  /** The day the dataset is built around. Defaults to now. */
  today?: Date
}

export function buildSampleData({ today = new Date() }: SampleOptions = {}): SampleData {
  const random = rng(20261014)
  const todayIso = iso(today)
  const categories = buildDefaultCategories()

  const categoryByName = new Map(categories.map((c) => [c.name, c]))
  const categoryId = (name: string): Id => {
    const found = categoryByName.get(name)
    if (!found) throw new Error(`sample data references unknown category: ${name}`)
    return found.id
  }

  const accounts: Account[] = ACCOUNTS.map(({ balance: _balance, ...account }) => ({
    id: newId(),
    openingBalance: 0, // solved at the end, once every movement is known
    ...account,
    ...stamp(),
  }))
  const accountByName = new Map(accounts.map((a) => [a.name, a]))
  const accountId = (name: string): Id => {
    const found = accountByName.get(name)
    if (!found) throw new Error(`sample data references unknown account: ${name}`)
    return found.id
  }

  const transactions: Transaction[] = []
  const txn = (
    fields: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'tags' | 'status'> &
      Partial<Pick<Transaction, 'tags' | 'status'>>,
  ): Transaction => {
    const row: Transaction = {
      id: newId(),
      tags: [],
      status: 'posted',
      ...fields,
      ...stamp(),
    }
    transactions.push(row)
    return row
  }

  // ---- Income: two payroll runs a month across the six-month window --------
  const months = MONTHLY_SPEND.map((_, index) =>
    subMonths(today, MONTHLY_SPEND.length - 1 - index),
  )

  for (const month of months) {
    for (const day of PAYROLL_DAYS) {
      const date = new Date(month.getFullYear(), month.getMonth(), day)
      if (date > today) continue
      txn({
        type: 'income',
        amount: SALARY,
        accountId: accountId('BPI Savings'),
        categoryId: categoryId('Salary'),
        date: iso(date),
        note: 'Salary',
      })
    }
  }

  // ---- Named rows from the mockups, placed relative to today ---------------
  // Clamped to the first of the month: these rows are booked against this
  // month's allowance, so they must not slide back into the previous one when
  // the dataset is built early in a month.
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const dayOf = (offset: number) => {
    const date = addDays(today, -offset)
    return iso(date < monthStart ? monthStart : date)
  }

  const dinner = txn({
    type: 'expense',
    amount: 5_000_00,
    accountId: accountId('BPI Visa'),
    categoryId: categoryId('Dining out'),
    date: dayOf(4),
    note: 'Dinner · Ramen place',
    tags: ['date-night'],
  })

  const anchors: Record<string, Centavos> = {}
  const anchor = (
    category: string,
    amount: Centavos,
    offset: number,
    note: string,
    account: string,
    extra: Partial<Transaction> = {},
  ) => {
    anchors[category] = (anchors[category] ?? 0) + amount
    txn({
      type: 'expense',
      amount,
      accountId: accountId(account),
      categoryId: categoryId(category),
      date: dayOf(offset),
      note,
      ...extra,
    })
  }

  // One photographed receipt, so the receipts table is exercised end to end.
  const receipt: Receipt = {
    id: newId(),
    blob: new Blob([PLACEHOLDER_PNG], { type: 'image/png' }),
    mime: 'image/png',
    size: PLACEHOLDER_PNG.byteLength,
    ...stamp(),
  }

  anchors.Food = dinner.amount
  anchor('Food', 289_00, 0, 'Lunch with team', 'GCash', { tags: ['work'] })
  anchor('Groceries', 2_145_00, 1, 'SM Supermarket', 'Cash', {
    tags: ['weekly'],
    receiptId: receipt.id,
  })
  anchor('Transport', 214_00, 0, 'Ride to office', 'GCash')
  anchor('Bills', 3_410_00, 2, 'Electricity', 'BPI Savings')

  // Groceries is a child of Food and shares its budget.
  anchors.Food += anchors.Groceries ?? 0
  delete anchors.Groceries

  txn({
    type: 'transfer',
    amount: 2_000_00,
    accountId: accountId('BPI Savings'),
    toAccountId: accountId('GCash'),
    date: dayOf(2),
    note: 'Top up',
  })

  // ---- Generated spend, to the centavo of each month's target --------------
  const spendNames = Object.keys(CURRENT_MONTH_SPEND)
  const weights = spendNames.map((name) => CURRENT_MONTH_SPEND[name] ?? 0)

  months.forEach((month, monthIndex) => {
    const isCurrent = monthIndex === months.length - 1
    const target = MONTHLY_SPEND[monthIndex] ?? 0
    const perCategory = isCurrent
      ? spendNames.map((name) => CURRENT_MONTH_SPEND[name] ?? 0)
      : allocateByWeight(target, weights.map((w) => w * (0.75 + random() * 0.5)))

    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
    const lastDay = isCurrent ? today : lastDayOfMonth(month)
    const spanDays = Math.max(
      1,
      Math.round((lastDay.getTime() - firstDay.getTime()) / 86_400_000),
    )

    spendNames.forEach((name, index) => {
      // Rows already placed by hand come out of this month's allowance.
      const booked = isCurrent ? (anchors[name] ?? 0) : 0
      const remaining = (perCategory[index] ?? 0) - booked
      if (remaining <= 0) return

      const notes = NOTES[name] ?? NOTES.Other ?? ['Misc']
      const count = Math.min(notes.length, 2 + Math.floor(random() * 4))
      // Whole pesos read like real entries; the last row absorbs the odd
      // centavos so the month still totals exactly.
      const amounts = allocateByWeight(
        remaining,
        Array.from({ length: count }, () => 0.5 + random()),
      ).map((amount) => Math.round(amount / 100) * 100)
      const drift = remaining - amounts.reduce((a, b) => a + b, 0)
      amounts[amounts.length - 1] = (amounts.at(-1) ?? 0) + drift

      const payers = PAYERS[name] ?? [['Cash', 1] as [string, number]]
      const payerWeights = payers.map(([, weight]) => weight)

      amounts.forEach((amount, i) => {
        if (amount <= 0) return
        const pick = random()
        let cursor = 0
        const totalWeight = payerWeights.reduce((a, b) => a + b, 0)
        let payer = payers[0]?.[0] ?? 'Cash'
        for (const [accountName, weight] of payers) {
          cursor += weight / totalWeight
          if (pick <= cursor) {
            payer = accountName
            break
          }
        }

        const date = addDays(firstDay, Math.floor(random() * spanDays))
        txn({
          type: 'expense',
          amount,
          accountId: accountId(payer),
          categoryId: categoryId(name),
          date: iso(date > lastDay ? lastDay : date),
          note: notes[i % notes.length] ?? 'Misc',
          tags: random() < 0.22 ? [TAGS[Math.floor(random() * TAGS.length)] ?? 'work'] : [],
        })
      })
    })
  })

  // ---- Loans. Every movement also lands as a linked transaction. ----------
  const contacts: Contact[] = [
    { name: 'Juan Dela Cruz', phone: '+63 917 555 0142' },
    { name: 'Maria Santos' },
    { name: 'Ana Lim', note: 'Dinner split' },
    { name: 'Ken Reyes', phone: '+63 918 555 0110' },
  ].map((contact) => ({ id: newId(), ...contact, ...stamp() }))

  const contactId = (name: string): Id => {
    const found = contacts.find((c) => c.name === name)
    if (!found) throw new Error(`sample data references unknown contact: ${name}`)
    return found.id
  }

  const loans: Loan[] = []
  const loanPayments: LoanPayment[] = []

  /** A personal loan plus the transaction that moved the principal. */
  const personalLoan = (
    fields: Omit<Loan, 'id' | 'kind' | 'status' | 'createdAt' | 'updatedAt'> & {
      status?: Loan['status']
    },
  ): Loan => {
    const loan: Loan = { id: newId(), kind: 'personal', status: 'open', ...fields, ...stamp() }
    loans.push(loan)

    // A loan born from a split moves no money of its own — the original
    // transaction already did.
    if (loan.accountId && loan.splitFromTxnId === undefined) {
      txn({
        type: loan.direction === 'lent' ? 'expense' : 'income',
        amount: loan.principal,
        accountId: loan.accountId,
        date: loan.startDate,
        note: loan.note,
        loanId: loan.id,
      })
    }
    return loan
  }

  const concertTickets = personalLoan({
    direction: 'lent',
    contactId: contactId('Juan Dela Cruz'),
    principal: 3_000_00,
    startDate: iso(subMonths(today, 1)),
    dueDate: dayOf(3),
    note: 'Concert tickets',
    accountId: accountId('BPI Savings'),
  })

  personalLoan({
    direction: 'lent',
    contactId: contactId('Juan Dela Cruz'),
    principal: 3_500_00,
    startDate: dayOf(6),
    note: 'Phone repair',
    accountId: accountId('GCash'),
  })

  personalLoan({
    direction: 'lent',
    contactId: contactId('Maria Santos'),
    principal: 4_500_00,
    startDate: dayOf(11),
    dueDate: iso(addDays(today, 16)),
    note: 'Tuition help',
    accountId: accountId('BPI Savings'),
  })

  personalLoan({
    direction: 'lent',
    contactId: contactId('Ana Lim'),
    principal: 2_500_00,
    startDate: dinner.date,
    note: 'Dinner · Ramen place',
    splitFromTxnId: dinner.id,
  })

  personalLoan({
    direction: 'borrowed',
    contactId: contactId('Ken Reyes'),
    principal: 4_000_00,
    startDate: dayOf(8),
    dueDate: iso(addDays(today, 22)),
    note: 'Emergency cash',
    accountId: accountId('GCash'),
  })

  // Juan has paid back part of the concert tickets.
  const repayment = txn({
    type: 'income',
    amount: 1_000_00,
    accountId: accountId('GCash'),
    date: dayOf(9),
    note: 'Repayment · Concert tickets',
    loanId: concertTickets.id,
  })
  loanPayments.push({
    id: newId(),
    loanId: concertTickets.id,
    amount: 1_000_00,
    date: repayment.date,
    accountId: repayment.accountId,
    transactionId: repayment.id,
    ...stamp(),
  })

  // A settled loan, so the history section has something in it.
  const settled = personalLoan({
    direction: 'lent',
    contactId: contactId('Juan Dela Cruz'),
    principal: 800_00,
    startDate: iso(subMonths(today, 3)),
    note: 'Lunch money',
    accountId: accountId('Cash'),
    status: 'settled',
  })
  const settledPayment = txn({
    type: 'income',
    amount: 800_00,
    accountId: accountId('Cash'),
    date: iso(subMonths(today, 2)),
    note: 'Repayment · Lunch money',
    loanId: settled.id,
  })
  loanPayments.push({
    id: newId(),
    loanId: settled.id,
    amount: 800_00,
    date: settledPayment.date,
    accountId: settledPayment.accountId,
    transactionId: settledPayment.id,
    ...stamp(),
  })

  /** A formal loan with its instalments already paid to date. */
  const formalLoan = (
    fields: Omit<Loan, 'id' | 'kind' | 'status' | 'createdAt' | 'updatedAt'>,
    instalment: Centavos,
    paid: number,
    fromAccount: string,
  ): Loan => {
    const loan: Loan = { id: newId(), kind: 'formal', status: 'open', ...fields, ...stamp() }
    loans.push(loan)

    const start = parseISO(loan.startDate)
    for (let n = 1; n <= paid; n++) {
      const date = iso(addMonths(start, n))
      const payment = txn({
        type: 'expense',
        amount: instalment,
        accountId: accountId(fromAccount),
        date,
        note: `${loan.note} · #${n}`,
        loanId: loan.id,
      })
      loanPayments.push({
        id: newId(),
        loanId: loan.id,
        amount: instalment,
        date,
        accountId: payment.accountId,
        transactionId: payment.id,
        installmentNo: n,
        ...stamp(),
      })
    }
    return loan
  }

  formalLoan(
    {
      direction: 'borrowed',
      lender: 'BDO',
      principal: 650_000_00,
      ratePct: 9.5,
      termMonths: 60,
      startDate: iso(subMonths(today, 25)),
      note: 'Car loan',
      accountId: accountId('BPI Savings'),
    },
    13_651_00,
    24,
    'BPI Savings',
  )

  formalLoan(
    {
      direction: 'borrowed',
      lender: 'BPI Visa',
      principal: 54_000_00,
      ratePct: 0,
      termMonths: 12,
      startDate: iso(subMonths(today, 7)),
      note: 'Laptop installment',
      accountId: accountId('BPI Visa'),
    },
    4_500_00,
    6,
    'BPI Visa',
  )

  // ---- Recurring rules -----------------------------------------------------
  const nextOn = (dayOffset: number): DateOnly => iso(addDays(today, dayOffset))

  const recurring: Recurring[] = (
    [
      // name, amount, account, category, mode, days away, subscription
      ['Spotify', 149_00, 'GCash', 'Bills', 'confirm', 0, true],
      ['Rent', 15_000_00, 'BPI Savings', 'Home', 'auto', 1, false],
      ['Internet', 1_699_00, 'BPI Savings', 'Bills', 'confirm', 4, false],
      ['Netflix', 549_00, 'BPI Visa', 'Bills', 'auto', 6, true],
      ['iCloud storage', 149_00, 'BPI Visa', 'Bills', 'auto', 8, true],
      ['Car loan payment', 13_651_00, 'BPI Savings', 'Bills', 'confirm', 11, false],
      ['Electricity', 3_400_00, 'BPI Savings', 'Bills', 'confirm', 19, false],
      ['Water', 680_00, 'BPI Savings', 'Bills', 'confirm', 35, false],
      ['YouTube Premium', 400_00, 'BPI Visa', 'Bills', 'auto', 37, true],
    ] as const
  ).map(([name, amount, account, category, mode, offset, subscription]) => ({
    id: newId(),
    template: {
      type: 'expense' as const,
      amount,
      accountId: accountId(account),
      categoryId: categoryId(category),
      note: name,
      tags: subscription ? ['subscription'] : [],
    },
    freq: 'monthly' as const,
    interval: 1,
    startDate: iso(subMonths(today, 6)),
    nextDate: nextOn(offset),
    mode,
    ...stamp(),
  }))

  // Spotify came due today and is waiting for a yes — the pending row in
  // Activity. The scheduler owns `nextDate`, and it moves a rule on as it
  // makes the entry, so this one already points at next month.
  const spotify = recurring[0]
  if (spotify) {
    txn({
      type: 'expense',
      amount: spotify.template.amount,
      accountId: spotify.template.accountId,
      categoryId: spotify.template.categoryId,
      date: todayIso,
      note: spotify.template.note,
      recurringId: spotify.id,
      status: 'pending',
    })
    spotify.nextDate = iso(addMonths(today, 1))
  }

  // The electricity bill lands at a different figure every month, so the
  // forecast shows it as an estimate rather than a quoted ₱3,400.
  const electricity = recurring.find((rule) => rule.template.note === 'Electricity')
  const lastBill = transactions.find((row) => row.note === 'Electricity')
  if (electricity && lastBill) lastBill.recurringId = electricity.id

  // ---- Budgets and goals ---------------------------------------------------
  const month = format(today, 'yyyy-MM')
  const budgets: Budget[] = (
    [
      [null, 40_000_00, false],
      ['Bills', 9_000_00, false],
      ['Food', 10_000_00, false],
      ['Shopping', 5_000_00, false],
      ['Transport', 3_000_00, false],
      ['Health', 2_000_00, true],
    ] as const
  ).map(([name, limit, rollover]) => ({
    id: newId(),
    month,
    categoryId: name === null ? null : categoryId(name),
    limit,
    rollover,
    ...stamp(),
  }))

  const goals: Goal[] = [
    {
      name: 'Japan trip',
      target: 80_000_00,
      saved: 42_000_00,
      deadline: iso(addMonths(today, 5)),
    },
    { name: 'Emergency fund', target: 150_000_00, saved: 60_000_00 },
  ].map((goal) => ({ id: newId(), ...goal, ...stamp() }))

  // Settings travel with the dataset: loading it clears the table, and the
  // demo is meant to look like a used app, backup nudge and all.
  const settings: Setting[] = [
    { key: 'name', value: 'Alex' },
    { key: 'currency', value: 'PHP' },
    { key: 'theme', value: 'system' },
    { key: 'backupReminderDays', value: 30 },
    { key: 'lockEnabled', value: false },
    { key: 'lastBackupAt', value: addDays(today, -34).toISOString() },
  ]

  // ---- Solve opening balances so today's balances match the targets --------
  for (const account of accounts) {
    const target = ACCOUNTS.find((a) => a.name === account.name)?.balance ?? 0
    const moved = transactions
      .filter((t) => t.status === 'posted')
      .reduce((total, t) => total + accountDelta(t, account.id), 0)
    account.openingBalance = target - moved
  }

  transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  return {
    accounts,
    categories,
    contacts,
    transactions,
    loans,
    loanPayments,
    budgets,
    goals,
    recurring,
    receipts: [receipt],
    settings,
  }
}

/** Wipes every table. Used before loading the sample set. */
export async function clearAll(db: LedgerDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
}

/**
 * Replaces the contents of the database with the demo dataset.
 * Destructive by design — it is offered as "load sample data", not as a merge.
 */
export async function loadSampleData(
  db: LedgerDB = defaultDb,
  options: SampleOptions = {},
): Promise<SampleData> {
  const data = buildSampleData(options)

  await clearAll(db)
  await db.transaction('rw', db.tables, async () => {
    await db.accounts.bulkAdd(data.accounts)
    await db.categories.bulkAdd(data.categories)
    await db.contacts.bulkAdd(data.contacts)
    await db.transactions.bulkAdd(data.transactions)
    await db.loans.bulkAdd(data.loans)
    await db.loanPayments.bulkAdd(data.loanPayments)
    await db.budgets.bulkAdd(data.budgets)
    await db.goals.bulkAdd(data.goals)
    await db.recurring.bulkAdd(data.recurring)
    await db.receipts.bulkAdd(data.receipts)
    await db.settings.bulkPut(data.settings)
  })

  return data
}
