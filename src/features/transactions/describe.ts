/**
 * One transaction, resolved into the pieces every list row needs: tile,
 * title, category path, account, sign. Home, Activity and the calendar all
 * build their rows from this, so a transfer or an uncategorised entry reads
 * the same wherever it appears.
 */

import type { Account, Category, Centavos, Id, Transaction } from '@/db/types'

export interface TxnLookups {
  categoryById: ReadonlyMap<Id, Category>
  accountById: ReadonlyMap<Id, Account>
}

export const MUTED_COLOR = '#5B616B'

export function buildLookups(
  categories: readonly Category[],
  accounts: readonly Account[],
): TxnLookups {
  return {
    categoryById: new Map(categories.map((c) => [c.id, c])),
    accountById: new Map(accounts.map((a) => [a.id, a])),
  }
}

export interface TxnDescription {
  id: Id
  /** The note, falling back to the category when there is none. */
  title: string
  /** "Food › Groceries", or undefined when uncategorised. */
  categoryPath?: string
  accountName?: string
  toAccountName?: string
  tags: string[]
  hasReceipt: boolean
  isTransfer: boolean
  isPending: boolean
  /** Signed for display: negative when money leaves. */
  amount: Centavos
  /** Transfers move money sideways, so they are shown in ink. */
  tone: 'auto' | 'plain'
  color: string
  tileName: string
}

/** "Food › Groceries" for a subcategory, "Food" for a parent. */
export function categoryPath(
  categoryId: Id | undefined,
  lookups: TxnLookups,
): string | undefined {
  const category = categoryId ? lookups.categoryById.get(categoryId) : undefined
  if (!category) return undefined

  const parent = category.parentId ? lookups.categoryById.get(category.parentId) : undefined
  return parent ? `${parent.name} › ${category.name}` : category.name
}

export function describeTransaction(
  txn: Transaction,
  lookups: TxnLookups,
): TxnDescription {
  const account = lookups.accountById.get(txn.accountId)
  const common = {
    id: txn.id,
    tags: txn.tags,
    hasReceipt: txn.receiptId !== undefined,
    isPending: txn.status === 'pending',
  }

  if (txn.type === 'transfer') {
    const to = txn.toAccountId ? lookups.accountById.get(txn.toAccountId) : undefined
    return {
      ...common,
      title: `${account?.name ?? 'Account'} → ${to?.name ?? 'Account'}`,
      ...(account?.name ? { accountName: account.name } : {}),
      ...(to?.name ? { toAccountName: to.name } : {}),
      isTransfer: true,
      amount: txn.amount,
      tone: 'plain',
      color: account?.color ?? MUTED_COLOR,
      tileName: 'Transfer',
    }
  }

  const category = txn.categoryId ? lookups.categoryById.get(txn.categoryId) : undefined
  const path = categoryPath(txn.categoryId, lookups)
  const fallback = txn.loanId ? 'Loan' : 'Uncategorised'

  return {
    ...common,
    title: txn.note || path || fallback,
    ...(path ? { categoryPath: path } : {}),
    ...(account?.name ? { accountName: account.name } : {}),
    isTransfer: false,
    amount: txn.type === 'income' ? txn.amount : -txn.amount,
    tone: 'auto',
    color: category?.color ?? MUTED_COLOR,
    tileName: category?.name ?? fallback,
  }
}

/** Joins the non-empty parts of a subtitle with the mockups' separator. */
export const subtitle = (...parts: Array<string | undefined | false>): string =>
  parts.filter((part): part is string => Boolean(part)).join(' · ')

/** The subtitle Activity shows: category, account, tags, receipt. */
export function activitySubtitle(row: TxnDescription): string {
  if (row.isTransfer) return 'Transfer'

  return subtitle(
    row.categoryPath,
    row.accountName,
    ...row.tags.map((tag) => `#${tag}`),
    row.hasReceipt && '1 receipt',
  )
}
