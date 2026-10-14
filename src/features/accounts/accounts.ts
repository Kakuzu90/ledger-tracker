/**
 * Everything design/Accounts.dc.html shows, worked out from the accounts and
 * the ledger. Balances are computed, never stored, so this is the only place
 * that says what an account is worth today.
 */

import type { Account, AccountType, Centavos, Transaction } from '@/db/types'
import { accountBalance, creditAvailable, netWorth, type NetWorth } from '@/lib/balances'
import { ratio } from '@/lib/money'

export interface AccountSummary {
  account: Account
  balance: Centavos
}

export interface CardSummary extends AccountSummary {
  limit: Centavos
  /** Limit less what is owed. */
  available: Centavos
  /** 0–1 of the limit used; above 1 when the card is over its limit. */
  utilization: number
  /** "Statement 5th · due 25th", or undefined when the days are not set. */
  cycle?: string
}

export interface AccountsView {
  netWorth: NetWorth
  /** Cash, e-wallets and banks — anything that holds money. */
  spending: AccountSummary[]
  cards: CardSummary[]
  archived: AccountSummary[]
}

/** Human label for the row subtitle. */
export const TYPE_LABEL: Readonly<Record<AccountType, string>> = {
  cash: 'Wallet',
  bank: 'Bank',
  ewallet: 'E-wallet',
  credit: 'Credit card',
}

/** Spending accounts first, cards last; Dexie's own order is by uuid. */
const TYPE_ORDER: Readonly<Record<AccountType, number>> = {
  cash: 3,
  ewallet: 2,
  bank: 1,
  credit: 4,
}

/** 5 → "5th", 22 → "22nd". */
export function ordinal(day: number): string {
  const tens = day % 100
  if (tens >= 11 && tens <= 13) return `${day}th`
  switch (day % 10) {
    case 1:
      return `${day}st`
    case 2:
      return `${day}nd`
    case 3:
      return `${day}rd`
    default:
      return `${day}th`
  }
}

function cycleLabel(account: Account): string | undefined {
  const parts: string[] = []
  if (account.statementDay) parts.push(`Statement ${ordinal(account.statementDay)}`)
  if (account.dueDay) parts.push(`due ${ordinal(account.dueDay)}`)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function toCard(account: Account, balance: Centavos): CardSummary {
  const limit = account.creditLimit ?? 0
  const owed = Math.max(0, -balance)
  const cycle = cycleLabel(account)

  return {
    account,
    balance,
    limit,
    available: creditAvailable(account, balance),
    utilization: ratio(owed, limit),
    ...(cycle ? { cycle } : {}),
  }
}

export function buildAccountsView(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
): AccountsView {
  const byDisplayOrder = [...accounts].sort(
    (a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.name.localeCompare(b.name),
  )

  const spending: AccountSummary[] = []
  const cards: CardSummary[] = []
  const archived: AccountSummary[] = []

  for (const account of byDisplayOrder) {
    const balance = accountBalance(account, transactions)

    if (account.archived) archived.push({ account, balance })
    else if (account.type === 'credit') cards.push(toCard(account, balance))
    else spending.push({ account, balance })
  }

  return { netWorth: netWorth(accounts, transactions), spending, cards, archived }
}

/** What an account would leave behind if it were archived today. */
export function canArchive(summary: AccountSummary): boolean {
  return summary.balance === 0
}
