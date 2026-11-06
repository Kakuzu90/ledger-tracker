import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId, stamp, touch } from '@/db/db'
import type { Account, AccountType, Centavos, Id } from '@/db/types'
import { DEFAULT_CURRENCY } from '@/lib/money'
import { buildAccountsView, type AccountsView } from './accounts'
import { buildAccountHistory, type AccountHistory } from './history'
import { buildLookups, type TxnLookups } from '@/features/transactions/describe'

export function useAccountsView(): AccountsView | undefined {
  return useLiveQuery(async () => {
    const [accounts, transactions] = await Promise.all([
      db.accounts.toArray(),
      db.transactions.toArray(),
    ])
    return buildAccountsView(accounts, transactions)
  }, [])
}

export interface AccountHistoryData {
  /** Null once the account is gone, so the screen can leave. */
  history: AccountHistory | null
  lookups: TxnLookups
}

/** One account and everything that has moved through it. */
export function useAccountHistory(id: Id | undefined): AccountHistoryData | undefined {
  return useLiveQuery(async () => {
    if (!id) return undefined
    const [account, accounts, categories, transactions] = await Promise.all([
      db.accounts.get(id),
      db.accounts.toArray(),
      db.categories.toArray(),
      db.transactions.toArray(),
    ])

    const lookups = buildLookups(categories, accounts)
    if (!account) return { history: null, lookups }
    return { history: buildAccountHistory(account, transactions), lookups }
  }, [id])
}

export interface AccountDraft {
  name: string
  type: AccountType
  color: string
  openingBalance: Centavos
  creditLimit?: Centavos
  statementDay?: number
  dueDay?: number
}

/**
 * A credit card's balance is what is owed, so its opening balance is stored
 * negative. The form takes a positive "already owe" figure and this flips it.
 */
export function normalizeDraft(draft: AccountDraft): AccountDraft {
  if (draft.type === 'credit') {
    return { ...draft, openingBalance: -Math.abs(draft.openingBalance) }
  }

  const rest = { ...draft }
  delete rest.creditLimit
  delete rest.statementDay
  delete rest.dueDay
  return rest
}

export async function createAccount(draft: AccountDraft): Promise<Id> {
  const account: Account = {
    id: newId(),
    currency: DEFAULT_CURRENCY,
    archived: false,
    ...normalizeDraft(draft),
    ...stamp(),
  }

  await db.accounts.add(account)
  return account.id
}

export async function updateAccount(id: Id, draft: AccountDraft): Promise<void> {
  const normalized = normalizeDraft(draft)

  await db.accounts.update(id, {
    ...normalized,
    // Fields that no longer apply are cleared, not left stale.
    creditLimit: normalized.creditLimit,
    statementDay: normalized.statementDay,
    dueDay: normalized.dueDay,
    ...touch(),
  })
}

/**
 * Archiving keeps the history: the account disappears from the pickers and
 * from net worth, but its transactions stay where they are.
 */
export async function setArchived(id: Id, archived: boolean): Promise<void> {
  await db.accounts.update(id, { archived, ...touch() })
}

/**
 * Deleting is only offered for an account nothing points at — otherwise its
 * transactions would be left referring to something that no longer exists.
 */
export async function deleteAccount(id: Id): Promise<void> {
  await db.transaction('rw', db.accounts, db.transactions, async () => {
    const used = await db.transactions
      .filter((txn) => txn.accountId === id || txn.toAccountId === id)
      .count()

    if (used > 0) {
      const subject = used === 1 ? '1 transaction uses' : `${used} transactions use`
      throw new Error(`Archive it instead — ${subject} it`)
    }

    await db.accounts.delete(id)
  })
}
