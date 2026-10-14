import { describe, expect, it } from 'vitest'
import { buildSampleData, clearAll, loadSampleData } from './sample'
import type { Account, Category, Id } from './types'
import { freshDb } from '@/test/db'
import {
  accountBalance,
  categorySpend,
  monthOf,
  monthTotals,
  netWorth,
  spendForCategoryTree,
} from '@/lib/balances'
import { byContact, loanTotals, outstanding } from '@/lib/loans'
import { sumMoney } from '@/lib/money'

/** The day design/*.dc.html is drawn for. */
const TODAY = new Date(2026, 9, 14)
const MONTH = '2026-10'

const data = buildSampleData({ today: TODAY })

const byName = <T extends { name: string }>(rows: readonly T[], name: string): T => {
  const found = rows.find((row) => row.name === name)
  if (!found) throw new Error(`no row named ${name}`)
  return found
}

const childIdsByParent = (categories: readonly Category[]): Map<Id, Id[]> => {
  const map = new Map<Id, Id[]>()
  for (const category of categories) {
    if (category.parentId === undefined) continue
    map.set(category.parentId, [...(map.get(category.parentId) ?? []), category.id])
  }
  return map
}

describe('buildSampleData', () => {
  it('is deterministic for a given day', () => {
    const again = buildSampleData({ today: TODAY })
    expect(again.transactions.map((t) => [t.date, t.amount, t.note])).toEqual(
      data.transactions.map((t) => [t.date, t.amount, t.note]),
    )
  })

  it('gives every row an id, timestamps and integer centavos', () => {
    for (const txn of data.transactions) {
      expect(txn.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(txn.createdAt).toBeTruthy()
      expect(txn.updatedAt).toBeTruthy()
      expect(Number.isInteger(txn.amount)).toBe(true)
    }
  })
})

describe('the dashboard figures in Main.dc.html', () => {
  it('nets ₱64,250 across the accounts', () => {
    expect(netWorth(data.accounts, data.transactions)).toEqual({
      assets: 84_730_00,
      credit: -20_480_00,
      total: 64_250_00,
    })
  })

  it('shows ₱52,000 in and ₱31,480 out for the month', () => {
    expect(monthTotals(data.transactions, MONTH)).toEqual({
      income: 52_000_00,
      expense: 31_480_00,
      net: 20_520_00,
    })
  })

  it('lands each account on its balance from Accounts.dc.html', () => {
    const expected: Record<string, number> = {
      'BPI Savings': 58_420_00,
      Maya: 16_750_00,
      GCash: 6_310_00,
      Cash: 3_250_00,
      'BPI Visa': -20_480_00,
    }

    for (const [name, balance] of Object.entries(expected)) {
      expect(accountBalance(byName(data.accounts, name), data.transactions)).toBe(balance)
    }
  })

  it('owes the user ₱12,500 and leaves them owing ₱4,000', () => {
    expect(loanTotals(data.loans, data.loanPayments)).toEqual({
      owedToYou: 12_500_00,
      youOwe: 4_000_00,
      net: 8_500_00,
    })
  })
})

describe('the category split in Budgets.dc.html and Reports.dc.html', () => {
  const spend = categorySpend(data.transactions, MONTH)
  const children = childIdsByParent(data.categories)
  const spendFor = (name: string) =>
    spendForCategoryTree(spend, byName(data.categories, name).id, children)

  it.each([
    ['Bills', 9_200_00],
    ['Food', 8_940_00],
    ['Shopping', 3_960_00],
    ['Transport', 2_180_00],
    ['Health', 600_00],
  ])('spends %s down to the centavo', (name, expected) => {
    expect(spendFor(name)).toBe(expected)
  })

  it('leaves ₱6,600 outside the budgeted categories', () => {
    const budgeted = ['Bills', 'Food', 'Shopping', 'Transport', 'Health']
    const budgetedSpend = sumMoney(budgeted.map(spendFor))
    expect(monthTotals(data.transactions, MONTH).expense - budgetedSpend).toBe(6_600_00)
  })

  it('budgets ₱40,000 overall for the month', () => {
    const overall = data.budgets.find((b) => b.categoryId === null)
    expect(overall?.limit).toBe(40_000_00)
    expect(overall?.month).toBe(MONTH)
  })
})

describe('the six-month trend in Reports.dc.html', () => {
  it('averages ₱17,387 saved a month', () => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const date = new Date(2026, 9 - (5 - i), 1)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    })

    const saved = months.map((month) => monthTotals(data.transactions, month).net)
    expect(Math.round(sumMoney(saved) / months.length)).toBe(17_387_00)
  })

  it('has transactions in every month of the window', () => {
    const months = new Set(data.transactions.map((t) => monthOf(t.date)))
    for (const month of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) {
      expect(months).toContain(month)
    }
  })
})

describe('the bills in Bills.dc.html', () => {
  it('has nine recurring rules', () => {
    expect(data.recurring).toHaveLength(9)
  })

  it('bills ₱34,597 over seven payments in the next 30 days', () => {
    const horizon = new Date(2026, 9, 14 + 30).toISOString().slice(0, 10)
    // Six rules have yet to fire; Spotify's occurrence is already sitting in
    // the ledger waiting for a yes, and it is still a payment to come.
    const due = data.recurring.filter((r) => r.nextDate <= horizon)
    const waiting = data.transactions.filter((t) => t.status === 'pending')

    expect(due.length + waiting.length).toBe(7)
    expect(
      sumMoney([...due.map((r) => r.template.amount), ...waiting.map((t) => t.amount)]),
    ).toBe(34_597_00)
  })

  it('subscribes to ₱1,247 a month', () => {
    const subscriptions = data.recurring.filter((r) =>
      r.template.tags.includes('subscription'),
    )
    expect(subscriptions.map((r) => r.template.note)).toEqual([
      'Spotify',
      'Netflix',
      'iCloud storage',
      'YouTube Premium',
    ])
    expect(sumMoney(subscriptions.map((r) => r.template.amount))).toBe(1_247_00)
  })

  it('leaves the rule due today pending rather than posting it', () => {
    const pending = data.transactions.filter((t) => t.status === 'pending')
    expect(pending).toHaveLength(1)
    expect(pending[0]?.note).toBe('Spotify')
    expect(pending[0]?.recurringId).toBeDefined()
  })

  it('moves the rule behind a pending entry on, so it is not made twice', () => {
    const spotify = data.recurring.find((r) => r.template.note === 'Spotify')
    expect(spotify?.nextDate).toBe('2026-11-14')
  })

  it('links the last electricity bill to its rule, so the amount reads as a guess', () => {
    const rule = data.recurring.find((r) => r.template.note === 'Electricity')
    const bill = data.transactions.find((t) => t.note === 'Electricity')
    expect(bill?.recurringId).toBe(rule?.id)
    expect(bill?.amount).not.toBe(rule?.template.amount)
  })
})

describe('the loans in Loans.dc.html and Person.dc.html', () => {
  it('owes ₱5,500 from Juan across two open loans', () => {
    const juan = byName(data.contacts, 'Juan Dela Cruz')
    const entry = byContact(data.loans, data.loanPayments).get(juan.id)

    expect(entry?.loans).toHaveLength(2)
    expect(entry?.net).toBe(5_500_00)
  })

  it('leaves ₱2,000 of the concert tickets after a ₱1,000 repayment', () => {
    const tickets = data.loans.find((l) => l.note === 'Concert tickets')
    expect(outstanding(tickets!, data.loanPayments)).toBe(2_000_00)
  })

  it('traces the split loan back to the dinner that created it', () => {
    const split = data.loans.find((l) => l.splitFromTxnId !== undefined)
    const dinner = data.transactions.find((t) => t.id === split?.splitFromTxnId)

    expect(split?.principal).toBe(2_500_00)
    expect(dinner?.amount).toBe(5_000_00)
  })

  it('moves no money of its own for a split loan', () => {
    // The dinner transaction already left the account; a second one would
    // double-count the spend.
    const split = data.loans.find((l) => l.splitFromTxnId !== undefined)
    expect(data.transactions.filter((t) => t.loanId === split?.id)).toHaveLength(0)
  })

  it('pairs every loan payment with the transaction that carried it', () => {
    for (const payment of data.loanPayments) {
      const txn = data.transactions.find((t) => t.id === payment.transactionId)
      expect(txn).toBeDefined()
      expect(txn?.amount).toBe(payment.amount)
      expect(txn?.loanId).toBe(payment.loanId)
    }
  })

  it('has paid 24 of the 60 instalments on the car loan', () => {
    const car = data.loans.find((l) => l.note === 'Car loan')
    const paid = data.loanPayments.filter((p) => p.loanId === car?.id)

    expect(car?.termMonths).toBe(60)
    expect(paid).toHaveLength(24)
    expect(paid.map((p) => p.installmentNo)).toEqual(
      Array.from({ length: 24 }, (_, i) => i + 1),
    )
  })
})

describe('referential integrity', () => {
  const ids = (rows: readonly { id: string }[]) => new Set(rows.map((row) => row.id))

  it('points every transaction at accounts and categories that exist', () => {
    const accounts = ids(data.accounts)
    const categories = ids(data.categories)

    for (const txn of data.transactions) {
      expect(accounts).toContain(txn.accountId)
      if (txn.toAccountId) expect(accounts).toContain(txn.toAccountId)
      if (txn.categoryId) expect(categories).toContain(txn.categoryId)
    }
  })

  it('points every loan at a contact or a lender', () => {
    const contacts = ids(data.contacts)
    for (const loan of data.loans) {
      if (loan.kind === 'personal') expect(contacts).toContain(loan.contactId!)
      else expect(loan.lender).toBeTruthy()
    }
  })

  it('files transfers against two different accounts', () => {
    for (const txn of data.transactions.filter((t) => t.type === 'transfer')) {
      expect(txn.toAccountId).toBeDefined()
      expect(txn.toAccountId).not.toBe(txn.accountId)
    }
  })

  it('gives expenses an expense category and income an income one', () => {
    const kindById = new Map(data.categories.map((c) => [c.id, c.kind]))
    for (const txn of data.transactions) {
      if (txn.categoryId === undefined) continue
      if (txn.type === 'expense') expect(kindById.get(txn.categoryId)).toBe('expense')
      if (txn.type === 'income') expect(kindById.get(txn.categoryId)).toBe('income')
    }
  })
})

describe('other days of the month', () => {
  it('stays self-consistent when built mid-month', () => {
    const early = buildSampleData({ today: new Date(2026, 9, 3) })
    const worth = netWorth(early.accounts, early.transactions)

    // The headline totals move with the calendar, but balances still resolve.
    expect(worth.total).toBe(64_250_00)
    expect(monthTotals(early.transactions, MONTH).expense).toBe(31_480_00)
  })
})

describe('loadSampleData', () => {
  it('writes every table and can be reloaded', async () => {
    const db = await freshDb()

    await loadSampleData(db, { today: TODAY })
    expect(await db.transactions.count()).toBe(data.transactions.length)
    expect(await db.categories.count()).toBe(16)
    expect(await db.loans.count()).toBe(data.loans.length)

    // Loading twice replaces rather than duplicating.
    await loadSampleData(db, { today: TODAY })
    expect(await db.transactions.count()).toBe(data.transactions.length)

    const accounts = (await db.accounts.toArray()) as Account[]
    const transactions = await db.transactions.toArray()
    expect(netWorth(accounts, transactions).total).toBe(64_250_00)

    await clearAll(db)
    expect(await db.transactions.count()).toBe(0)
    db.close()
  })

  it('finds transactions through the date index', async () => {
    const db = await freshDb()
    await loadSampleData(db, { today: TODAY })

    const october = await db.transactions
      .where('date')
      .between('2026-10-01', '2026-10-31', true, true)
      .toArray()

    expect(monthTotals(october, MONTH).expense).toBe(31_480_00)
    db.close()
  })

  it('links the groceries row to a stored receipt', async () => {
    const db = await freshDb()
    await loadSampleData(db, { today: TODAY })

    // `note` is free text and deliberately unindexed — searching it is a scan.
    const groceries = await db.transactions
      .filter((t) => t.note === 'SM Supermarket')
      .first()
    expect(groceries?.receiptId).toBeDefined()

    const receipt = await db.receipts.get(groceries!.receiptId!)
    expect(receipt?.mime).toBe('image/png')
    expect(receipt?.size).toBe(70)
    // The Blob itself is not asserted here: fake-indexeddb's structured clone
    // drops Blobs and hands back a bare object. Browsers store them fine.
    db.close()
  })

  it('builds the receipt as a real Blob', () => {
    const receipt = data.receipts[0]
    expect(receipt?.blob).toBeInstanceOf(Blob)
    expect(receipt?.blob.size).toBe(receipt?.size)
    expect(receipt?.blob.type).toBe('image/png')
  })

  it('finds transactions by tag through the multi-entry index', async () => {
    const db = await freshDb()
    await loadSampleData(db, { today: TODAY })

    const tagged = await db.transactions.where('tags').equals('work').toArray()
    expect(tagged.length).toBeGreaterThan(0)
    expect(tagged.every((t) => t.tags.includes('work'))).toBe(true)
    db.close()
  })
})
