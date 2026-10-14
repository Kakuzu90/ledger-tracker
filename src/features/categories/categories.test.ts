import { describe, expect, it } from 'vitest'
import { buildSampleData } from '@/db/sample'
import type { Budget, Category, Recurring, Transaction } from '@/db/types'
import {
  buildCategoriesView,
  buildTags,
  CATEGORY_COLORS,
  countEntries,
  mergeLabel,
  mergePreview,
  moveTo,
  planFromOrder,
  reorderPlan,
} from './categories'

const TODAY = new Date(2026, 9, 14)
const sample = buildSampleData({ today: TODAY })
const input = { categories: sample.categories, transactions: sample.transactions }
const view = buildCategoriesView(input)

const row = (name: string) => view.rows.find((r) => r.category.name === name)
const id = (name: string) => sample.categories.find((c) => c.name === name)?.id as string

const stamps = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }

const category = (over: Partial<Category> & Pick<Category, 'id' | 'name'>): Category => ({
  kind: 'expense',
  color: '#0F6E64',
  order: 0,
  archived: false,
  ...stamps,
  ...over,
})

const txn = (over: Partial<Transaction> & Pick<Transaction, 'id'>): Transaction => ({
  type: 'expense',
  amount: 100_00,
  accountId: 'a',
  date: '2026-10-02',
  note: '',
  tags: [],
  status: 'posted',
  ...stamps,
  ...over,
})

describe('countEntries', () => {
  it('counts the entries on each category', () => {
    const counts = countEntries([
      txn({ id: 't1', categoryId: 'food' }),
      txn({ id: 't2', categoryId: 'food' }),
      txn({ id: 't3', categoryId: 'bills' }),
      txn({ id: 't4' }),
    ])
    expect(counts.get('food')).toBe(2)
    expect(counts.get('bills')).toBe(1)
  })

  it('ignores an uncategorised entry rather than counting it somewhere', () => {
    expect(countEntries([txn({ id: 't1' })]).size).toBe(0)
  })
})

describe('buildCategoriesView', () => {
  it('shows the expense categories in their own order', () => {
    expect(view.rows.map((r) => r.category.name).slice(0, 4)).toEqual([
      'Food',
      'Transport',
      'Bills',
      'Shopping',
    ])
  })

  it('counts both kinds for the segmented buttons', () => {
    expect(view.expenseCount).toBe(11)
    expect(view.incomeCount).toBe(3)
  })

  it('nests the subcategories under their parent', () => {
    expect(row('Food')?.children.map((c) => c.category.name)).toEqual([
      'Groceries',
      'Dining out',
    ])
  })

  it('counts a subcategory’s entries towards its parent', () => {
    const food = row('Food')
    const own = countEntries(sample.transactions).get(id('Food')) ?? 0
    const children = food?.children.reduce((sum, c) => sum + c.entries, 0) ?? 0
    expect(food?.entries).toBe(own + children)
    expect(children).toBeGreaterThan(0)
  })

  it('writes the subtitle the mockup shows', () => {
    expect(row('Food')?.subtitle).toMatch(/^2 subcategories · \d+ entries$/)
    expect(row('Bills')?.subtitle).toMatch(/^\d+ entries$/)
  })

  it('says "1 entry", not "1 entrys"', () => {
    const single = buildCategoriesView({
      categories: [category({ id: 'c1', name: 'Gifts' })],
      transactions: [txn({ id: 't1', categoryId: 'c1' })],
    })
    expect(single.rows[0]?.subtitle).toBe('1 entry')
  })

  it('switches to the income categories', () => {
    const income = buildCategoriesView(input, 'income')
    expect(income.rows.map((r) => r.category.name)).toEqual([
      'Salary',
      'Freelance',
      'Other income',
    ])
  })

  it('leaves an archived category out', () => {
    const archived = buildCategoriesView({
      categories: [
        category({ id: 'c1', name: 'Gifts' }),
        category({ id: 'c2', name: 'Old', archived: true }),
      ],
      transactions: [],
    })
    expect(archived.rows).toHaveLength(1)
    expect(archived.expenseCount).toBe(1)
  })
})

describe('buildTags', () => {
  it('totals the spend behind each tag and counts the entries', () => {
    const tags = buildTags([
      txn({ id: 't1', tags: ['japan-trip'], amount: 10_000_00 }),
      txn({ id: 't2', tags: ['japan-trip', 'gifts'], amount: 8_400_00 }),
      txn({ id: 't3', tags: ['gifts'], amount: 500_00 }),
    ])
    expect(tags[0]).toEqual({ tag: 'japan-trip', total: 18_400_00, count: 2 })
    expect(tags[1]).toEqual({ tag: 'gifts', total: 8_900_00, count: 2 })
  })

  it('counts an income entry without adding it to the spend', () => {
    const tags = buildTags([
      txn({ id: 't1', tags: ['work'], type: 'income', amount: 50_000_00 }),
      txn({ id: 't2', tags: ['work'], amount: 300_00 }),
    ])
    expect(tags[0]).toEqual({ tag: 'work', total: 300_00, count: 2 })
  })

  it('leaves transfers and loan movements out of the total', () => {
    const tags = buildTags([
      txn({ id: 't1', tags: ['move'], type: 'transfer', amount: 5_000_00 }),
      txn({ id: 't2', tags: ['move'], loanId: 'l1', amount: 2_000_00 }),
    ])
    expect(tags[0]).toEqual({ tag: 'move', total: 0, count: 2 })
  })

  it('has nothing to show for an untagged ledger', () => {
    expect(buildTags([txn({ id: 't1' })])).toEqual([])
  })

  it('finds the tags in the sample ledger', () => {
    expect(view.tags.length).toBeGreaterThan(0)
    expect(view.tags.map((t) => t.tag)).toContain('japan-trip')
  })
})

describe('moveTo', () => {
  it('moves an item down', () => {
    expect(moveTo(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an item up', () => {
    expect(moveTo(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('clamps a target past the end instead of losing the item', () => {
    expect(moveTo(['a', 'b'], 0, 9)).toEqual(['b', 'a'])
    expect(moveTo(['a', 'b'], 1, -4)).toEqual(['b', 'a'])
  })

  it('leaves the list alone when the index is not in it', () => {
    expect(moveTo(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
  })

  it('is a no-op when nothing moves', () => {
    expect(moveTo(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
  })
})

describe('reorderPlan', () => {
  const list = [
    category({ id: 'a', name: 'A', order: 0 }),
    category({ id: 'b', name: 'B', order: 1 }),
    category({ id: 'c', name: 'C', order: 2 }),
  ]

  it('writes only the rows whose order changed', () => {
    expect(reorderPlan(list, 2, 0)).toEqual([
      { id: 'c', order: 0 },
      { id: 'a', order: 1 },
      { id: 'b', order: 2 },
    ])
  })

  it('writes nothing when the move changes nothing', () => {
    expect(reorderPlan(list, 1, 1)).toEqual([])
  })

  it('touches only the two rows that swapped', () => {
    expect(reorderPlan(list, 0, 1)).toEqual([
      { id: 'b', order: 0 },
      { id: 'a', order: 1 },
    ])
  })

  it('renumbers a list that came in with gaps', () => {
    const gappy = [
      category({ id: 'a', name: 'A', order: 0 }),
      category({ id: 'b', name: 'B', order: 7 }),
    ]
    expect(reorderPlan(gappy, 0, 0)).toEqual([{ id: 'b', order: 1 }])
  })
})

describe('mergePreview', () => {
  const categories = [
    category({ id: 'food', name: 'Food' }),
    category({ id: 'groceries', name: 'Groceries', parentId: 'food' }),
    category({ id: 'snacks', name: 'Snacks' }),
    category({ id: 'treats', name: 'Treats', parentId: 'snacks' }),
    category({ id: 'salary', name: 'Salary', kind: 'income' }),
  ]

  const transactions = [
    txn({ id: 't1', categoryId: 'snacks' }),
    txn({ id: 't2', categoryId: 'snacks' }),
    txn({ id: 't3', categoryId: 'food' }),
  ]

  const budgets: Budget[] = [
    { id: 'b1', month: '2026-10', categoryId: 'snacks', limit: 500_00, rollover: false, ...stamps },
  ]

  const recurring: Recurring[] = [
    {
      id: 'r1',
      template: { type: 'expense', amount: 100_00, accountId: 'a', note: '', tags: [], categoryId: 'snacks' },
      freq: 'monthly',
      interval: 1,
      startDate: '2026-01-01',
      nextDate: '2026-11-01',
      mode: 'auto',
      ...stamps,
    },
  ]

  const all = { categories, transactions, budgets, recurring }

  it('counts everything that would move', () => {
    expect(mergePreview(['snacks'], 'food', all)).toEqual({
      entries: 2,
      children: 1,
      budgets: 1,
      rules: 1,
    })
  })

  it('ignores the target appearing in its own source list', () => {
    expect(mergePreview(['snacks', 'food'], 'food', all).entries).toBe(2)
  })

  it('needs something to merge', () => {
    expect(mergePreview(['food'], 'food', all).problem).toBe('Choose at least two categories')
  })

  it('needs a target that exists', () => {
    expect(mergePreview(['snacks'], 'gone', all).problem).toBe(
      'Choose a category to merge into',
    )
  })

  it('refuses to mix income with expense', () => {
    expect(mergePreview(['salary'], 'food', all).problem).toBe(
      'Income and expense categories cannot be merged',
    )
  })

  it('refuses to fold a parent into its own child', () => {
    expect(mergePreview(['food'], 'groceries', all).problem).toBe(
      'Merge Groceries into its parent instead',
    )
  })

  it('does count a subcategory merged into its own parent', () => {
    expect(mergePreview(['groceries'], 'food', all)).toMatchObject({ children: 0 })
  })
})

describe('mergeLabel', () => {
  it('names what the button will do', () => {
    expect(mergeLabel(1, 'Food')).toBe('Merge 1 category into Food')
    expect(mergeLabel(3, 'Food')).toBe('Merge 3 categories into Food')
  })
})

describe('CATEGORY_COLORS', () => {
  it('offers the seeded palette', () => {
    expect(CATEGORY_COLORS).toContain('#E07A3F')
    expect(new Set(CATEGORY_COLORS).size).toBe(CATEGORY_COLORS.length)
  })
})

describe('merging into a subcategory', () => {
  it('refuses to hand it subcategories of its own', () => {
    const categories = [
      category({ id: 'food', name: 'Food' }),
      category({ id: 'groceries', name: 'Groceries', parentId: 'food' }),
      category({ id: 'snacks', name: 'Snacks' }),
      category({ id: 'treats', name: 'Treats', parentId: 'snacks' }),
    ]
    const all = { categories, transactions: [], budgets: [], recurring: [] }

    expect(mergePreview(['snacks'], 'groceries', all).problem).toBe(
      'Groceries is a subcategory, so it cannot take subcategories',
    )
  })

  it('allows a childless category to be folded into one', () => {
    const categories = [
      category({ id: 'food', name: 'Food' }),
      category({ id: 'groceries', name: 'Groceries', parentId: 'food' }),
      category({ id: 'market', name: 'Market' }),
    ]
    const all = { categories, transactions: [], budgets: [], recurring: [] }

    expect(mergePreview(['market'], 'groceries', all).problem).toBeUndefined()
  })
})

describe('planFromOrder', () => {
  const list = [
    category({ id: 'a', name: 'A', order: 0 }),
    category({ id: 'b', name: 'B', order: 1 }),
    category({ id: 'c', name: 'C', order: 2 }),
  ]

  it('numbers the ids in the sequence given', () => {
    expect(planFromOrder(list, ['c', 'a', 'b'])).toEqual([
      { id: 'c', order: 0 },
      { id: 'a', order: 1 },
      { id: 'b', order: 2 },
    ])
  })

  it('writes nothing when the sequence is already the stored one', () => {
    expect(planFromOrder(list, ['a', 'b', 'c'])).toEqual([])
  })
})
