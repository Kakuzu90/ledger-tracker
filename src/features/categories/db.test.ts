import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import type { Budget, Category, Recurring, Transaction } from '@/db/types'
import {
  applyOrder,
  createCategory,
  mergeCategories,
  removeCategory,
  removeTag,
  renameTag,
  restoreCategory,
  undoMerge,
  undoTagEdit,
  updateCategory,
} from './db'

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

const budget = (over: Partial<Budget> & Pick<Budget, 'id'>): Budget => ({
  month: '2026-10',
  categoryId: null,
  limit: 1_000_00,
  rollover: false,
  ...stamps,
  ...over,
})

const rule = (over: Partial<Recurring> & Pick<Recurring, 'id'>): Recurring => ({
  template: { type: 'expense', amount: 100_00, accountId: 'a', note: 'Rent', tags: [] },
  freq: 'monthly',
  interval: 1,
  startDate: '2026-01-01',
  nextDate: '2026-11-01',
  mode: 'auto',
  ...stamps,
  ...over,
})

const reset = async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
}

beforeEach(reset)

describe('createCategory', () => {
  it('adds a top-level category at the end of its kind', async () => {
    await db.categories.bulkAdd([
      category({ id: 'a', name: 'Food', order: 0 }),
      category({ id: 'b', name: 'Bills', order: 1 }),
    ])

    const id = await createCategory({ name: 'Pets', color: '#A33B5C', kind: 'expense' })
    expect(await db.categories.get(id)).toMatchObject({ name: 'Pets', order: 2 })
  })

  it('counts only its own siblings when placing a subcategory', async () => {
    await db.categories.bulkAdd([
      category({ id: 'food', name: 'Food', order: 0 }),
      category({ id: 'bills', name: 'Bills', order: 1 }),
      category({ id: 'gro', name: 'Groceries', parentId: 'food', order: 0 }),
    ])

    const id = await createCategory({
      name: 'Takeaway',
      color: '#E07A3F',
      kind: 'expense',
      parentId: 'food',
    })
    expect(await db.categories.get(id)).toMatchObject({ parentId: 'food', order: 1 })
  })

  it('refuses a name a sibling already has', async () => {
    await db.categories.add(category({ id: 'a', name: 'Food' }))
    await expect(
      createCategory({ name: 'food', color: '#000000', kind: 'expense' }),
    ).rejects.toThrow('There is already a food')
  })

  it('allows the same name under a different parent', async () => {
    await db.categories.bulkAdd([
      category({ id: 'food', name: 'Food' }),
      category({ id: 'home', name: 'Home', order: 1 }),
      category({ id: 'g', name: 'Supplies', parentId: 'home' }),
    ])
    await expect(
      createCategory({ name: 'Supplies', color: '#000000', kind: 'expense', parentId: 'food' }),
    ).resolves.toBeTypeOf('string')
  })

  it('needs a name', async () => {
    await expect(
      createCategory({ name: '  ', color: '#000000', kind: 'expense' }),
    ).rejects.toThrow('Give the category a name')
  })
})

describe('updateCategory', () => {
  beforeEach(async () => {
    await db.categories.bulkAdd([
      category({ id: 'food', name: 'Food', color: '#E07A3F' }),
      category({ id: 'gro', name: 'Groceries', parentId: 'food', color: '#E07A3F' }),
    ])
  })

  it('renames and recolours', async () => {
    await updateCategory('food', { name: 'Eating', color: '#1D4E89' })
    expect(await db.categories.get('food')).toMatchObject({
      name: 'Eating',
      color: '#1D4E89',
    })
  })

  it('carries a parent’s new colour down to its children', async () => {
    await updateCategory('food', { name: 'Food', color: '#1D4E89' })
    expect((await db.categories.get('gro'))?.color).toBe('#1D4E89')
  })

  it('leaves the parent alone when a child is recoloured', async () => {
    await updateCategory('gro', { name: 'Groceries', color: '#000000' })
    expect((await db.categories.get('food'))?.color).toBe('#E07A3F')
  })
})

describe('applyOrder', () => {
  it('writes the rows a drag moved', async () => {
    await db.categories.bulkAdd([
      category({ id: 'a', name: 'A', order: 0 }),
      category({ id: 'b', name: 'B', order: 1 }),
    ])

    await applyOrder([
      { id: 'b', order: 0 },
      { id: 'a', order: 1 },
    ])

    expect((await db.categories.get('a'))?.order).toBe(1)
    expect((await db.categories.get('b'))?.order).toBe(0)
  })

  it('does nothing with an empty plan', async () => {
    await expect(applyOrder([])).resolves.toBeUndefined()
  })
})

describe('removeCategory', () => {
  it('deletes one nothing points at', async () => {
    await db.categories.add(category({ id: 'a', name: 'Pets' }))

    const removed = await removeCategory('a')
    expect(removed.archived).toBe(false)
    expect(await db.categories.count()).toBe(0)
  })

  it('archives one with entries behind it, so history keeps its name', async () => {
    await db.categories.add(category({ id: 'a', name: 'Pets' }))
    await db.transactions.add(txn({ id: 't1', categoryId: 'a' }))

    const removed = await removeCategory('a')
    expect(removed.archived).toBe(true)
    expect(await db.categories.get('a')).toMatchObject({ archived: true })
  })

  it('archives a parent rather than orphaning its children', async () => {
    await db.categories.bulkAdd([
      category({ id: 'food', name: 'Food' }),
      category({ id: 'gro', name: 'Groceries', parentId: 'food' }),
    ])
    expect((await removeCategory('food')).archived).toBe(true)
  })

  it('archives one a budget or a rule still points at', async () => {
    await db.categories.bulkAdd([
      category({ id: 'a', name: 'Pets' }),
      category({ id: 'b', name: 'Rent' }),
    ])
    await db.budgets.add(budget({ id: 'b1', categoryId: 'a' }))
    await db.recurring.add(
      rule({ id: 'r1', template: { type: 'expense', amount: 1, accountId: 'a', note: '', tags: [], categoryId: 'b' } }),
    )

    expect((await removeCategory('a')).archived).toBe(true)
    expect((await removeCategory('b')).archived).toBe(true)
  })

  it('puts back what it took, either way', async () => {
    await db.categories.add(category({ id: 'a', name: 'Pets' }))
    const deleted = await removeCategory('a')
    await restoreCategory(deleted)
    expect(await db.categories.get('a')).toMatchObject({ name: 'Pets', archived: false })

    await db.transactions.add(txn({ id: 't1', categoryId: 'a' }))
    const archived = await removeCategory('a')
    await restoreCategory(archived)
    expect(await db.categories.get('a')).toMatchObject({ archived: false })
  })

  it('refuses one that is already gone', async () => {
    await expect(removeCategory('nope')).rejects.toThrow('already gone')
  })
})

describe('mergeCategories', () => {
  beforeEach(async () => {
    await db.categories.bulkAdd([
      category({ id: 'food', name: 'Food', order: 0 }),
      category({ id: 'snacks', name: 'Snacks', order: 1 }),
      category({ id: 'treats', name: 'Treats', parentId: 'snacks' }),
    ])
    await db.transactions.bulkAdd([
      txn({ id: 't1', categoryId: 'snacks' }),
      txn({ id: 't2', categoryId: 'food' }),
    ])
    await db.recurring.add(
      rule({
        id: 'r1',
        template: { type: 'expense', amount: 1, accountId: 'a', note: '', tags: [], categoryId: 'snacks' },
      }),
    )
  })

  it('moves the entries, the subcategories and the rules across', async () => {
    await mergeCategories(['snacks'], 'food')

    expect((await db.transactions.get('t1'))?.categoryId).toBe('food')
    expect((await db.categories.get('treats'))?.parentId).toBe('food')
    expect((await db.recurring.get('r1'))?.template.categoryId).toBe('food')
    expect(await db.categories.get('snacks')).toBeUndefined()
  })

  it('repoints a budget when the target has none that month', async () => {
    await db.budgets.add(budget({ id: 'b1', categoryId: 'snacks', limit: 500_00 }))

    await mergeCategories(['snacks'], 'food')
    expect(await db.budgets.get('b1')).toMatchObject({ categoryId: 'food', limit: 500_00 })
  })

  it('adds the limits together when both had one that month', async () => {
    await db.budgets.bulkAdd([
      budget({ id: 'b1', categoryId: 'snacks', limit: 500_00 }),
      budget({ id: 'b2', categoryId: 'food', limit: 9_000_00 }),
    ])

    await mergeCategories(['snacks'], 'food')
    expect(await db.budgets.get('b2')).toMatchObject({ limit: 9_500_00 })
    expect(await db.budgets.get('b1')).toBeUndefined()
  })

  it('refuses a merge that does not make sense', async () => {
    await expect(mergeCategories(['food'], 'food')).rejects.toThrow(
      'Choose at least two categories',
    )
  })

  it('puts everything back on undo', async () => {
    await db.budgets.bulkAdd([
      budget({ id: 'b1', categoryId: 'snacks', limit: 500_00 }),
      budget({ id: 'b2', categoryId: 'food', limit: 9_000_00 }),
      budget({ id: 'b3', month: '2026-09', categoryId: 'snacks', limit: 400_00 }),
    ])

    const record = await mergeCategories(['snacks'], 'food')
    await undoMerge(record)

    expect(await db.categories.get('snacks')).toMatchObject({ name: 'Snacks', order: 1 })
    expect((await db.transactions.get('t1'))?.categoryId).toBe('snacks')
    expect((await db.categories.get('treats'))?.parentId).toBe('snacks')
    expect((await db.recurring.get('r1'))?.template.categoryId).toBe('snacks')
    expect(await db.budgets.get('b1')).toMatchObject({ categoryId: 'snacks', limit: 500_00 })
    expect(await db.budgets.get('b2')).toMatchObject({ limit: 9_000_00 })
    expect(await db.budgets.get('b3')).toMatchObject({ categoryId: 'snacks' })
  })
})

describe('tags', () => {
  beforeEach(async () => {
    await db.transactions.bulkAdd([
      txn({ id: 't1', tags: ['japan-trip', 'gifts'] }),
      txn({ id: 't2', tags: ['japan-trip'] }),
      txn({ id: 't3', tags: ['work'] }),
    ])
  })

  it('renames a tag everywhere it appears', async () => {
    await renameTag('japan-trip', 'japan')

    expect((await db.transactions.get('t1'))?.tags).toEqual(['japan', 'gifts'])
    expect((await db.transactions.get('t2'))?.tags).toEqual(['japan'])
    expect((await db.transactions.get('t3'))?.tags).toEqual(['work'])
  })

  it('strips a leading hash the user typed', async () => {
    await renameTag('work', '#office')
    expect((await db.transactions.get('t3'))?.tags).toEqual(['office'])
  })

  it('does not leave a duplicate when renaming onto an existing tag', async () => {
    await renameTag('gifts', 'japan-trip')
    expect((await db.transactions.get('t1'))?.tags).toEqual(['japan-trip'])
  })

  it('needs a name', async () => {
    await expect(renameTag('work', '  ')).rejects.toThrow('Give the tag a name')
  })

  it('does nothing when the name has not changed', async () => {
    expect(await renameTag('work', 'work')).toEqual({ transactions: [] })
  })

  it('removes a tag without touching the entries themselves', async () => {
    await removeTag('japan-trip')

    expect((await db.transactions.get('t1'))?.tags).toEqual(['gifts'])
    expect((await db.transactions.get('t2'))?.tags).toEqual([])
    expect(await db.transactions.count()).toBe(3)
  })

  it('puts the tags back on undo', async () => {
    const edit = await removeTag('japan-trip')
    await undoTagEdit(edit)

    expect((await db.transactions.get('t1'))?.tags).toEqual(['japan-trip', 'gifts'])
    expect((await db.transactions.get('t2'))?.tags).toEqual(['japan-trip'])
  })
})
