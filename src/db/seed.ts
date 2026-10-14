/**
 * First-launch defaults. These are product data, not sample data: every
 * install gets them, and `ensureSeeded` is safe to call on every launch.
 */

import type { LedgerDB } from './db'
import { db as defaultDb, newId, stamp } from './db'
import type { Category, CategoryKind } from './types'
import { DEFAULT_CURRENCY } from '@/lib/money'

interface CategorySeed {
  name: string
  color: string
  children?: readonly string[]
}

/** Colours are the category dots from design/QuickAdd.dc.html. */
const EXPENSE_CATEGORIES: readonly CategorySeed[] = [
  { name: 'Food', color: '#E07A3F', children: ['Groceries', 'Dining out'] },
  { name: 'Transport', color: '#1D4E89' },
  { name: 'Bills', color: '#4B3A8C' },
  { name: 'Shopping', color: '#8A2452' },
  { name: 'Health', color: '#0F6E64' },
  { name: 'Home', color: '#7A6A3F' },
  { name: 'Entertainment', color: '#B4501A' },
  { name: 'Education', color: '#2C6E8A' },
  { name: 'Personal', color: '#6B4C8A' },
  { name: 'Gifts', color: '#A33B5C' },
  { name: 'Other', color: '#5B616B' },
]

const INCOME_CATEGORIES: readonly CategorySeed[] = [
  { name: 'Salary', color: '#0F6E64' },
  { name: 'Freelance', color: '#1D4E89' },
  { name: 'Other income', color: '#5B616B' },
]

/** Flattens the seed lists into rows; children follow their parent. */
export function buildDefaultCategories(): Category[] {
  const rows: Category[] = []

  const add = (seeds: readonly CategorySeed[], kind: CategoryKind) => {
    seeds.forEach((seed, index) => {
      const parent: Category = {
        id: newId(),
        name: seed.name,
        kind,
        color: seed.color,
        order: index,
        archived: false,
        ...stamp(),
      }
      rows.push(parent)

      seed.children?.forEach((childName, childIndex) => {
        rows.push({
          id: newId(),
          name: childName,
          kind,
          parentId: parent.id,
          color: seed.color,
          order: childIndex,
          archived: false,
          ...stamp(),
        })
      })
    })
  }

  add(EXPENSE_CATEGORIES, 'expense')
  add(INCOME_CATEGORIES, 'income')
  return rows
}

export const DEFAULT_SETTINGS: Readonly<Record<string, unknown>> = {
  /** Shown in the home greeting; empty until the user says who they are. */
  name: '',
  currency: DEFAULT_CURRENCY,
  theme: 'system',
  /** Days between backup nudges on the home screen. */
  backupReminderDays: 30,
  lockEnabled: false,
}

export interface SeedResult {
  categoriesAdded: number
  settingsAdded: number
}

/**
 * Idempotent: categories are only seeded into an empty table, and a setting
 * is only written when it is missing, so a user's own values survive.
 */
export async function ensureSeeded(db: LedgerDB = defaultDb): Promise<SeedResult> {
  let categoriesAdded = 0
  let settingsAdded = 0

  await db.transaction('rw', db.categories, db.settings, async () => {
    if ((await db.categories.count()) === 0) {
      const rows = buildDefaultCategories()
      await db.categories.bulkAdd(rows)
      categoriesAdded = rows.length
    }

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if ((await db.settings.get(key)) === undefined) {
        await db.settings.put({ key, value })
        settingsAdded += 1
      }
    }
  })

  return { categoriesAdded, settingsAdded }
}
