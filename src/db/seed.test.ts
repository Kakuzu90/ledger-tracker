import { beforeEach, describe, expect, it } from 'vitest'
import type { LedgerDB } from './db'
import { buildDefaultCategories, DEFAULT_SETTINGS, ensureSeeded } from './seed'
import { freshDb } from '@/test/db'

describe('buildDefaultCategories', () => {
  const categories = buildDefaultCategories()

  it('seeds the categories the mockups show', () => {
    const topLevel = categories.filter((c) => c.parentId === undefined)
    expect(topLevel.filter((c) => c.kind === 'expense')).toHaveLength(11)
    expect(topLevel.filter((c) => c.kind === 'income')).toHaveLength(3)
  })

  it('nests Groceries and Dining out under Food', () => {
    const food = categories.find((c) => c.name === 'Food')
    const children = categories.filter((c) => c.parentId === food?.id)
    expect(children.map((c) => c.name)).toEqual(['Groceries', 'Dining out'])
  })

  it('gives a subcategory its parent’s colour', () => {
    const food = categories.find((c) => c.name === 'Food')
    const groceries = categories.find((c) => c.name === 'Groceries')
    expect(groceries?.color).toBe(food?.color)
  })

  it('orders each kind from zero', () => {
    const expense = categories.filter((c) => c.kind === 'expense' && c.parentId === undefined)
    expect(expense.map((c) => c.order)).toEqual([...expense.keys()])
  })

  it('gives every row an id and timestamps', () => {
    for (const category of categories) {
      expect(category.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(category.createdAt).toBe(category.updatedAt)
    }
  })

  it('builds fresh ids on each call', () => {
    const again = buildDefaultCategories()
    expect(again[0]?.id).not.toBe(categories[0]?.id)
  })
})

describe('ensureSeeded', () => {
  let db: LedgerDB

  beforeEach(async () => {
    db = await freshDb()
  })

  it('fills an empty database', async () => {
    const result = await ensureSeeded(db)

    expect(result.categoriesAdded).toBe(16)
    expect(result.settingsAdded).toBe(Object.keys(DEFAULT_SETTINGS).length)
    expect(await db.categories.count()).toBe(16)
  })

  it('adds nothing on a second run', async () => {
    await ensureSeeded(db)
    const second = await ensureSeeded(db)

    expect(second).toEqual({ categoriesAdded: 0, settingsAdded: 0 })
    expect(await db.categories.count()).toBe(16)
  })

  it('keeps a setting the user has already changed', async () => {
    await db.settings.put({ key: 'theme', value: 'dark' })
    await ensureSeeded(db)

    expect((await db.settings.get('theme'))?.value).toBe('dark')
  })

  it('does not re-seed categories into a database the user has edited', async () => {
    await ensureSeeded(db)
    const food = await db.categories.where('name').equals('Food').first()
    await db.categories.delete(food!.id)

    await ensureSeeded(db)

    // 15, not 31: a user who deletes a category does not get it back.
    expect(await db.categories.count()).toBe(15)
  })
})
