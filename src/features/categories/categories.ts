/**
 * Categories & tags as data (design/Categories.dc.html): the tree with its
 * entry counts, the tag cloud, the reorder arithmetic and the merge preview.
 *
 * Reordering and merging are the two things on this screen that rewrite rows
 * the rest of the app reads, so both are worked out here, as plain values, to
 * be asserted without a database.
 */

import type {
  Budget,
  Category,
  CategoryKind,
  Centavos,
  Id,
  Recurring,
  Transaction,
} from '@/db/types'
import { countsAsFlow } from '@/lib/balances'
import { sumMoney } from '@/lib/money'
import { orderCategories } from '@/features/transactions/categories'

/** The palette a new category picks from — the seeded category colours. */
export const CATEGORY_COLORS: readonly string[] = [
  '#E07A3F',
  '#1D4E89',
  '#4B3A8C',
  '#8A2452',
  '#0F6E64',
  '#7A6A3F',
  '#B4501A',
  '#2C6E8A',
  '#6B4C8A',
  '#A33B5C',
  '#5B616B',
]

export interface ChildRow {
  category: Category
  entries: number
}

export interface ParentRow {
  category: Category
  children: ChildRow[]
  /** Entries on the category itself and on everything under it. */
  entries: number
  /** "2 subcategories · 64 entries" */
  subtitle: string
}

export interface TagRow {
  tag: string
  /** Expense total across the entries carrying it. */
  total: Centavos
  count: number
}

export interface CategoriesView {
  kind: CategoryKind
  rows: ParentRow[]
  /** Top-level counts for the two segmented buttons. */
  expenseCount: number
  incomeCount: number
  tags: TagRow[]
}

export interface CategoriesInput {
  categories: readonly Category[]
  transactions: readonly Transaction[]
}

/** The three words this screen counts, two of which do not take a plain -s. */
const PLURALS: Readonly<Record<string, string>> = {
  entry: 'entries',
  subcategory: 'subcategories',
  category: 'categories',
}

const plural = (count: number, word: string): string =>
  `${count} ${count === 1 ? word : (PLURALS[word] ?? `${word}s`)}`

/** How many entries sit on each category id. */
export function countEntries(
  transactions: readonly Transaction[],
): Map<Id, number> {
  const counts = new Map<Id, number>()
  for (const txn of transactions) {
    if (txn.categoryId === undefined) continue
    counts.set(txn.categoryId, (counts.get(txn.categoryId) ?? 0) + 1)
  }
  return counts
}

/** The tag chips, biggest spend first. */
export function buildTags(transactions: readonly Transaction[]): TagRow[] {
  const byTag = new Map<string, Transaction[]>()
  for (const txn of transactions) {
    for (const tag of txn.tags) {
      const list = byTag.get(tag) ?? []
      list.push(txn)
      byTag.set(tag, list)
    }
  }

  return [...byTag.entries()]
    .map(([tag, rows]) => ({
      tag,
      total: sumMoney(
        rows.filter((txn) => countsAsFlow(txn) && txn.type === 'expense').map((t) => t.amount),
      ),
      count: rows.length,
    }))
    .sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag))
}

export function buildCategoriesView(
  { categories, transactions }: CategoriesInput,
  kind: CategoryKind = 'expense',
): CategoriesView {
  const entries = countEntries(transactions)
  const live = categories.filter((category) => !category.archived)
  const ordered = orderCategories(live, kind)

  const rows: ParentRow[] = ordered
    .filter((category) => category.parentId === undefined)
    .map((category) => {
      const children: ChildRow[] = ordered
        .filter((child) => child.parentId === category.id)
        .map((child) => ({ category: child, entries: entries.get(child.id) ?? 0 }))

      const total =
        (entries.get(category.id) ?? 0) +
        children.reduce((sum, child) => sum + child.entries, 0)

      return {
        category,
        children,
        entries: total,
        subtitle:
          children.length > 0
            ? `${plural(children.length, 'subcategory')} · ${plural(total, 'entry')}`
            : plural(total, 'entry'),
      }
    })

  const topLevel = (of: CategoryKind) =>
    live.filter((category) => category.kind === of && category.parentId === undefined).length

  return {
    kind,
    rows,
    expenseCount: topLevel('expense'),
    incomeCount: topLevel('income'),
    tags: buildTags(transactions),
  }
}

// ---- reordering ----------------------------------------------------------

/** Moves one item of a list to another index, leaving the rest in order. */
export function moveTo<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  if (from < 0 || from >= next.length) return next
  const target = Math.min(Math.max(to, 0), next.length - 1)
  const [item] = next.splice(from, 1)
  if (item === undefined) return next
  next.splice(target, 0, item)
  return next
}

/**
 * The `order` each row should end up with, given the ids in their new
 * sequence. Only the rows that actually changed are returned, so a drag
 * writes two or three rows rather than the whole table.
 */
export function planFromOrder(
  categories: readonly Category[],
  ids: readonly Id[],
): Array<{ id: Id; order: number }> {
  return ids
    .map((id, index) => ({ id, order: index }))
    .filter(({ id, order }) => categories.find((c) => c.id === id)?.order !== order)
}

/** The same plan, for a move from one index to another. */
export function reorderPlan(
  categories: readonly Category[],
  from: number,
  to: number,
): Array<{ id: Id; order: number }> {
  return planFromOrder(
    categories,
    moveTo(categories, from, to).map((category) => category.id),
  )
}

// ---- merging -------------------------------------------------------------

export interface MergePreview {
  /** Entries that would change category. */
  entries: number
  /** Subcategories that would move across. */
  children: number
  /** Budgets whose limits would be added together. */
  budgets: number
  /** Recurring rules that would point at the target instead. */
  rules: number
  /** Set when the merge cannot go ahead; the sentence to show. */
  problem?: string
}

export interface MergeInput {
  categories: readonly Category[]
  transactions: readonly Transaction[]
  budgets: readonly Budget[]
  recurring: readonly Recurring[]
}

/**
 * What merging `sourceIds` into `targetId` would move. Refused rather than
 * attempted when the result would not make sense — a category cannot be
 * folded into its own child, and the two kinds do not mix.
 */
export function mergePreview(
  sourceIds: readonly Id[],
  targetId: Id,
  { categories, transactions, budgets, recurring }: MergeInput,
): MergePreview {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const target = byId.get(targetId)
  const sources = sourceIds.filter((id) => id !== targetId)

  const empty: MergePreview = { entries: 0, children: 0, budgets: 0, rules: 0 }

  if (!target) return { ...empty, problem: 'Choose a category to merge into' }
  if (sources.length === 0) return { ...empty, problem: 'Choose at least two categories' }

  const sourceSet = new Set(sources)
  if (sources.some((id) => byId.get(id)?.kind !== target.kind)) {
    return { ...empty, problem: 'Income and expense categories cannot be merged' }
  }
  // Folding a parent into one of its own children would make the child its
  // own parent. The user almost always means it the other way round.
  if (target.parentId !== undefined && sourceSet.has(target.parentId)) {
    return { ...empty, problem: `Merge ${target.name} into its parent instead` }
  }

  const count = <T>(rows: readonly T[], has: (row: T) => boolean) =>
    rows.filter(has).length

  const children = count(
    categories,
    (category) => sourceSet.has(category.parentId ?? '') && !sourceSet.has(category.id),
  )

  // Categories nest one level deep everywhere else in the app, so a
  // subcategory cannot inherit subcategories of its own.
  if (target.parentId !== undefined && children > 0) {
    return {
      ...empty,
      problem: `${target.name} is a subcategory, so it cannot take subcategories`,
    }
  }

  return {
    entries: count(transactions, (txn) => sourceSet.has(txn.categoryId ?? '')),
    children,
    budgets: count(budgets, (budget) => sourceSet.has(budget.categoryId ?? '')),
    rules: count(recurring, (rule) => sourceSet.has(rule.template.categoryId ?? '')),
  }
}

/** "Merge 2 categories into Food" — the confirm button. */
export function mergeLabel(sourceCount: number, targetName: string): string {
  return `Merge ${plural(sourceCount, 'category')} into ${targetName}`
}
