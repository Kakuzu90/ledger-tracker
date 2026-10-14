/**
 * Reads and writes for Categories & tags.
 *
 * Renaming or recolouring a category touches one row; reordering, merging
 * and the tag edits touch many, so each of those is one Dexie transaction
 * and each hands back enough to put things the way they were.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId, stamp, touch } from '@/db/db'
import type {
  Budget,
  Category,
  CategoryKind,
  Id,
  Recurring,
  Transaction,
} from '@/db/types'
import { mergePreview } from './categories'

export interface CategoriesData {
  categories: Category[]
  transactions: Transaction[]
  budgets: Budget[]
  recurring: Recurring[]
}

export function useCategoriesData(): CategoriesData | undefined {
  return useLiveQuery(async () => {
    const [categories, transactions, budgets, recurring] = await Promise.all([
      db.categories.toArray(),
      db.transactions.toArray(),
      db.budgets.toArray(),
      db.recurring.toArray(),
    ])
    return { categories, transactions, budgets, recurring }
  }, [])
}

export interface CategoryDraft {
  name: string
  color: string
  kind: CategoryKind
  parentId?: Id
}

function checkName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') throw new Error('Give the category a name')
  return trimmed
}

export async function createCategory(draft: CategoryDraft): Promise<Id> {
  const name = checkName(draft.name)

  return db.transaction('rw', db.categories, async () => {
    const siblings = await db.categories
      .filter((category) =>
        draft.parentId === undefined
          ? category.kind === draft.kind && category.parentId === undefined
          : category.parentId === draft.parentId,
      )
      .toArray()

    if (siblings.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`There is already a ${name}`)
    }

    const category: Category = {
      id: newId(),
      name,
      kind: draft.kind,
      color: draft.color,
      // New rows go to the end, where the user last looked.
      order: siblings.reduce((max, sibling) => Math.max(max, sibling.order + 1), 0),
      archived: false,
      ...(draft.parentId ? { parentId: draft.parentId } : {}),
      ...stamp(),
    }

    await db.categories.add(category)
    return category.id
  })
}

/**
 * Renaming or recolouring. A subcategory follows its parent's colour
 * everywhere it is drawn, so recolouring a parent recolours its children
 * rather than leaving them mismatched.
 */
export async function updateCategory(
  id: Id,
  fields: { name: string; color: string },
): Promise<void> {
  const name = checkName(fields.name)

  await db.transaction('rw', db.categories, async () => {
    const category = await db.categories.get(id)
    if (!category) throw new Error('That category is already gone')

    await db.categories.update(id, { name, color: fields.color, ...touch() })

    if (category.parentId === undefined && category.color !== fields.color) {
      const children = await db.categories.where('parentId').equals(id).primaryKeys()
      for (const childId of children) {
        await db.categories.update(childId, { color: fields.color, ...touch() })
      }
    }
  })
}

/** Writes the rows a drag moved. See `reorderPlan`. */
export async function applyOrder(
  plan: ReadonlyArray<{ id: Id; order: number }>,
): Promise<void> {
  if (plan.length === 0) return
  await db.transaction('rw', db.categories, async () => {
    for (const { id, order } of plan) {
      await db.categories.update(id, { order, ...touch() })
    }
  })
}

export interface RemovedCategory {
  category: Category
  /** True when history kept it; false when it was deleted outright. */
  archived: boolean
}

/**
 * Removes a category. One that nothing points at is deleted; one with
 * history behind it is archived instead, so old entries keep their name
 * rather than turning into "Uncategorised" years later.
 */
export async function removeCategory(id: Id): Promise<RemovedCategory> {
  return db.transaction(
    'rw',
    db.categories,
    db.transactions,
    db.budgets,
    db.recurring,
    async () => {
      const category = await db.categories.get(id)
      if (!category) throw new Error('That category is already gone')

      const used =
        (await db.transactions.where('categoryId').equals(id).count()) > 0 ||
        (await db.categories.where('parentId').equals(id).count()) > 0 ||
        (await db.budgets.where('categoryId').equals(id).count()) > 0 ||
        (await db.recurring.filter((rule) => rule.template.categoryId === id).count()) > 0

      if (used) {
        await db.categories.update(id, { archived: true, ...touch() })
      } else {
        await db.categories.delete(id)
      }

      return { category, archived: used }
    },
  )
}

export async function restoreCategory({
  category,
  archived,
}: RemovedCategory): Promise<void> {
  if (archived) {
    await db.categories.update(category.id, { archived: false, ...touch() })
  } else {
    await db.categories.put(category)
  }
}

export interface MergeRecord {
  /** The categories that were folded away. */
  removed: Category[]
  /** Entries that changed category, with where they were. */
  transactions: Array<{ id: Id; categoryId: Id }>
  children: Array<{ id: Id; parentId: Id }>
  rules: Array<{ id: Id; categoryId: Id }>
  /** Budget rows repointed at the target. */
  budgetsMoved: Array<{ id: Id; categoryId: Id }>
  /** Target rows whose limit absorbed another, with the limit they had. */
  budgetsGrown: Array<{ id: Id; limit: number }>
  /** Source rows that were absorbed and deleted. */
  budgetsDeleted: Budget[]
}

/**
 * Folds `sourceIds` into `targetId`: entries, subcategories, budgets and
 * recurring rules all move across, and the sources go. Everything needed to
 * undo it comes back, because a merge is not something to discover was
 * wrong with no way out.
 */
export async function mergeCategories(
  sourceIds: readonly Id[],
  targetId: Id,
): Promise<MergeRecord> {
  return db.transaction(
    'rw',
    db.categories,
    db.transactions,
    db.budgets,
    db.recurring,
    async () => {
      const categories = await db.categories.toArray()
      const transactions = await db.transactions.toArray()
      const budgets = await db.budgets.toArray()
      const recurring = await db.recurring.toArray()

      const preview = mergePreview(sourceIds, targetId, {
        categories,
        transactions,
        budgets,
        recurring,
      })
      if (preview.problem) throw new Error(preview.problem)

      const sources = new Set(sourceIds.filter((id) => id !== targetId))
      const record: MergeRecord = {
        removed: categories.filter((category) => sources.has(category.id)),
        transactions: [],
        children: [],
        rules: [],
        budgetsMoved: [],
        budgetsGrown: [],
        budgetsDeleted: [],
      }

      for (const txn of transactions) {
        if (!sources.has(txn.categoryId ?? '')) continue
        record.transactions.push({ id: txn.id, categoryId: txn.categoryId as Id })
        await db.transactions.update(txn.id, { categoryId: targetId, ...touch() })
      }

      for (const child of categories) {
        if (!sources.has(child.parentId ?? '') || sources.has(child.id)) continue
        record.children.push({ id: child.id, parentId: child.parentId as Id })
        await db.categories.update(child.id, { parentId: targetId, ...touch() })
      }

      for (const rule of recurring) {
        if (!sources.has(rule.template.categoryId ?? '')) continue
        record.rules.push({ id: rule.id, categoryId: rule.template.categoryId as Id })
        await db.recurring.update(rule.id, {
          template: { ...rule.template, categoryId: targetId },
          ...touch(),
        })
      }

      // Two budgets for the same month cannot both stand, so the limits are
      // added: the user budgeted that much for the spending either way.
      const targetBudgets = new Map(
        budgets.filter((b) => b.categoryId === targetId).map((b) => [b.month, b]),
      )
      for (const budget of budgets) {
        if (!sources.has(budget.categoryId ?? '')) continue
        const existing = targetBudgets.get(budget.month)

        if (existing) {
          record.budgetsGrown.push({ id: existing.id, limit: existing.limit })
          record.budgetsDeleted.push(budget)
          await db.budgets.update(existing.id, {
            limit: existing.limit + budget.limit,
            ...touch(),
          })
          await db.budgets.delete(budget.id)
        } else {
          record.budgetsMoved.push({ id: budget.id, categoryId: budget.categoryId as Id })
          await db.budgets.update(budget.id, { categoryId: targetId, ...touch() })
          targetBudgets.set(budget.month, { ...budget, categoryId: targetId })
        }
      }

      await db.categories.bulkDelete([...sources])
      return record
    },
  )
}

/** Puts back exactly what `mergeCategories` moved. */
export async function undoMerge(record: MergeRecord): Promise<void> {
  await db.transaction(
    'rw',
    db.categories,
    db.transactions,
    db.budgets,
    db.recurring,
    async () => {
      await db.categories.bulkPut(record.removed)

      for (const { id, categoryId } of record.transactions) {
        await db.transactions.update(id, { categoryId, ...touch() })
      }
      for (const { id, parentId } of record.children) {
        await db.categories.update(id, { parentId, ...touch() })
      }
      for (const { id, categoryId } of record.rules) {
        const rule = await db.recurring.get(id)
        if (rule) {
          await db.recurring.update(id, {
            template: { ...rule.template, categoryId },
            ...touch(),
          })
        }
      }
      for (const { id, categoryId } of record.budgetsMoved) {
        await db.budgets.update(id, { categoryId, ...touch() })
      }
      for (const { id, limit } of record.budgetsGrown) {
        await db.budgets.update(id, { limit, ...touch() })
      }
      if (record.budgetsDeleted.length > 0) {
        await db.budgets.bulkPut(record.budgetsDeleted)
      }
    },
  )
}

export interface TagEdit {
  /** Entries that carried the tag, with the tags they had. */
  transactions: Array<{ id: Id; tags: string[] }>
}

async function editTags(
  tag: string,
  change: (tags: string[]) => string[],
): Promise<TagEdit> {
  return db.transaction('rw', db.transactions, async () => {
    const rows = await db.transactions.where('tags').equals(tag).toArray()
    const edit: TagEdit = { transactions: [] }

    for (const txn of rows) {
      edit.transactions.push({ id: txn.id, tags: [...txn.tags] })
      await db.transactions.update(txn.id, { tags: change(txn.tags), ...touch() })
    }

    return edit
  })
}

/** Renames a tag across every entry. Merging into an existing tag is fine. */
export async function renameTag(from: string, to: string): Promise<TagEdit> {
  const next = to.trim().replace(/^#/, '')
  if (next === '') throw new Error('Give the tag a name')
  if (next === from) return { transactions: [] }

  return editTags(from, (tags) => [...new Set(tags.map((t) => (t === from ? next : t)))])
}

export async function removeTag(tag: string): Promise<TagEdit> {
  return editTags(tag, (tags) => tags.filter((t) => t !== tag))
}

export async function undoTagEdit(edit: TagEdit): Promise<void> {
  await db.transaction('rw', db.transactions, async () => {
    for (const { id, tags } of edit.transactions) {
      await db.transactions.update(id, { tags, ...touch() })
    }
  })
}
