import { describe, expect, it } from 'vitest'
import { buildDashboard, type DashboardInput } from './dashboard'
import { buildSampleData } from '@/db/sample'
import { formatMoney } from '@/lib/money'

const TODAY = new Date(2026, 9, 14)
const sample = buildSampleData({ today: TODAY })

const input: DashboardInput = {
  accounts: sample.accounts,
  categories: sample.categories,
  transactions: sample.transactions,
  budgets: sample.budgets,
  loans: sample.loans,
  loanPayments: sample.loanPayments,
  recurring: sample.recurring,
  lastBackupAt: sample.settings.find((s) => s.key === 'lastBackupAt')?.value as string,
}

const home = buildDashboard(input, TODAY)

describe('the net balance card', () => {
  it('shows the ₱64,250 from the mockup', () => {
    expect(formatMoney(home.netWorth.total, { compact: true })).toBe('₱64,250')
  })

  it('shows the month in and out', () => {
    expect(formatMoney(home.month.income, { compact: true })).toBe('₱52,000')
    expect(formatMoney(home.month.expense, { compact: true })).toBe('₱31,480')
  })

  it('counts the accounts, credit cards apart', () => {
    expect(home.accountSummary).toBe('4 accounts · 1 credit card')
  })
})

describe('the budget card', () => {
  const budget = home.budget!

  it('reads ₱31,480 of ₱40,000 at 79%', () => {
    expect(budget.spent).toBe(31_480_00)
    expect(budget.limit).toBe(40_000_00)
    expect(Math.round(budget.share * 100)).toBe(79)
  })

  it('works out what is left and what that allows per day', () => {
    expect(budget.remaining).toBe(8_520_00)
    expect(budget.daysLeft).toBe(18)
    // Whole pesos, not ₱473.33.
    expect(budget.perDay).toBe(473_00)
  })

  it('reports an over-budget month as a negative remainder and no daily allowance', () => {
    const over = buildDashboard(
      {
        ...input,
        budgets: input.budgets.map((b) =>
          b.categoryId === null ? { ...b, limit: 20_000_00 } : b,
        ),
      },
      TODAY,
    )

    expect(over.budget?.remaining).toBeLessThan(0)
    expect(over.budget?.perDay).toBeNull()
    expect(over.budget!.share).toBeGreaterThan(1)
  })

  it('is absent when the month has no budget', () => {
    expect(buildDashboard({ ...input, budgets: [] }, TODAY).budget).toBeNull()
  })
})

describe('the loans card', () => {
  it('shows ₱12,500 owed to the user across three people, one overdue', () => {
    expect(home.loans.owedToYou).toBe(12_500_00)
    expect(home.loans.peopleOwing).toBe(3)
    expect(home.loans.overdue).toBe(1)
  })

  it('shows ₱4,000 owed by the user to one person', () => {
    expect(home.loans.youOwe).toBe(4_000_00)
    expect(home.loans.peopleOwed).toBe(1)
    expect(home.loans.nextDue).toBe('2026-11-05')
  })

  it('leads with the biggest debt', () => {
    expect(home.loans.formal[0]?.title).toBe('Car loan · BDO')
  })

  it('amortises the car loan rather than subtracting payments', () => {
    const car = home.loans.formal.find((loan) => loan.title.startsWith('Car loan'))

    expect(car?.title).toBe('Car loan · BDO')
    // Principal less payments would say ₱322,376 — that ignores the interest.
    expect(car?.remaining).toBe(426_161_50)
    expect(Math.round((car?.share ?? 0) * 100)).toBe(34)
  })

  it('handles a 0% loan too', () => {
    const laptop = home.loans.formal.find((loan) => loan.title.startsWith('Laptop'))
    expect(laptop?.remaining).toBe(27_000_00)
  })
})

describe('the upcoming bills card', () => {
  it('lists the next three by date', () => {
    expect(home.bills.map((bill) => bill.title)).toEqual(['Spotify', 'Rent', 'Internet'])
  })

  it('says when each one lands and whether it adds itself', () => {
    expect(home.bills[0]?.when).toBe('Today · Ask first')
    expect(home.bills[1]?.when).toBe('Tomorrow · Auto-add')
  })

  it('carries the day of the month for the tile', () => {
    expect(home.bills[1]?.day).toBe(15)
  })
})

describe('the recent list', () => {
  it('shows the five most recent posted rows', () => {
    expect(home.recent).toHaveLength(5)
    expect(home.recent[0]?.subtitle).toContain('Today')
  })

  it('leaves out the pending recurring row', () => {
    expect(home.recent.some((row) => row.title === 'Spotify')).toBe(false)
  })

  it('signs an expense negative and income positive', () => {
    const lunch = home.recent.find((row) => row.title === 'Lunch with team')
    expect(lunch?.amount).toBe(-289_00)
    expect(lunch?.subtitle).toBe('Food · GCash · Today')
  })

  it('names the subcategory path', () => {
    // Not in the newest five on its own, so narrow the input to it.
    const groceries = buildDashboard(
      {
        ...input,
        transactions: input.transactions.filter((t) => t.note === 'SM Supermarket'),
      },
      TODAY,
    )

    expect(groceries.recent[0]?.subtitle).toBe('Food › Groceries · Cash · Yesterday')
  })

  it('renders a transfer as from → to, in plain ink', () => {
    const withTransfer = buildDashboard(
      {
        ...input,
        transactions: input.transactions.filter(
          (t) => t.type === 'transfer' || t.date === '2026-10-14',
        ),
      },
      TODAY,
    )
    const transfer = withTransfer.recent.find((row) => row.title.includes('→'))

    expect(transfer?.title).toBe('BPI Savings → GCash')
    expect(transfer?.subtitle).toBe('Transfer · Oct 12')
    expect(transfer?.tone).toBe('plain')
  })
})

describe('the backup reminder', () => {
  it('counts the days since the last backup', () => {
    expect(home.backupAge).toBe(34)
  })

  it('says there has never been one when the setting is missing', () => {
    const withoutBackup = { ...input }
    delete withoutBackup.lastBackupAt
    expect(buildDashboard(withoutBackup, TODAY).backupAge).toBeNull()
  })
})

describe('an empty database', () => {
  const empty = buildDashboard(
    {
      accounts: [],
      categories: [],
      transactions: [],
      budgets: [],
      loans: [],
      loanPayments: [],
      recurring: [],
    },
    TODAY,
  )

  it('renders zeroes rather than failing', () => {
    expect(empty.netWorth.total).toBe(0)
    expect(empty.month).toEqual({ income: 0, expense: 0 })
    expect(empty.budget).toBeNull()
    expect(empty.recent).toEqual([])
    expect(empty.bills).toEqual([])
  })

  it('says no accounts rather than "0 accounts · 0 credit cards"', () => {
    expect(empty.accountSummary).toBe('0 accounts')
  })
})
