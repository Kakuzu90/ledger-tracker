import { describe, expect, it } from 'vitest'
import { orderCategories } from './categories'
import { buildDefaultCategories } from '@/db/seed'

const names = (rows: { name: string }[]) => rows.map((c) => c.name)

describe('orderCategories', () => {
  const all = buildDefaultCategories()

  it('puts each child straight after its parent', () => {
    const ordered = names(orderCategories(all, 'expense'))
    expect(ordered.slice(0, 3)).toEqual(['Food', 'Groceries', 'Dining out'])
  })

  it('keeps the seeded order of the parents', () => {
    expect(names(orderCategories(all, 'expense'))).toEqual([
      'Food',
      'Groceries',
      'Dining out',
      'Transport',
      'Bills',
      'Shopping',
      'Health',
      'Home',
      'Entertainment',
      'Education',
      'Personal',
      'Gifts',
      'Other',
    ])
  })

  it('lists expense before income when no kind is given', () => {
    const ordered = names(orderCategories(all))
    expect(ordered[0]).toBe('Food')
    expect(ordered.slice(-3)).toEqual(['Salary', 'Freelance', 'Other income'])
  })

  it('does not reorder on every call', () => {
    expect(names(orderCategories(all))).toEqual(names(orderCategories(all)))
  })

  it('copes with a child whose parent is filtered out', () => {
    const withoutFood = all.filter((c) => c.name !== 'Food')
    // An orphan is dropped rather than crashing the list.
    expect(names(orderCategories(withoutFood, 'expense'))).not.toContain('Groceries')
  })

  it('returns nothing for no categories', () => {
    expect(orderCategories([])).toEqual([])
  })
})
