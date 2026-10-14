import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Account, Category, CategoryKind, Id } from '@/db/types'
import { orderCategories } from '@/features/transactions/categories'

/** Spending accounts first, cards last — Dexie's own order is by uuid. */
const TYPE_ORDER: Record<Account['type'], number> = { cash: 0, ewallet: 1, bank: 2, credit: 3 }

/** Accounts a transaction can be filed against. */
export function useAccounts(): Account[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.accounts.toArray())
        .filter((a) => !a.archived)
        .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.name.localeCompare(b.name)),
    [],
  )
}

/**
 * The account the last entry was filed against. People pay for things in
 * runs, so the previous choice is a better guess than the first in the list.
 */
export function useLastUsedAccountId(): Id | undefined {
  return useLiveQuery(async () => {
    const latest = await db.transactions.orderBy('date').last()
    return latest?.accountId
  }, [])
}

/**
 * Categories for the chosen side of the ledger, each parent followed by its
 * children — the order the chips appear in.
 */
export function useCategories(kind: CategoryKind): Category[] | undefined {
  return useLiveQuery(
    async () =>
      orderCategories(
        (await db.categories.toArray()).filter((c) => !c.archived),
        kind,
      ),
    [kind],
  )
}
