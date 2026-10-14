import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import {
  addToGoal,
  copyBudgets,
  createGoal,
  deleteGoal,
  restoreGoal,
  setBudget,
  updateGoal,
  type GoalDraft,
} from './db'

const reset = async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
}

const draft = (over: Partial<GoalDraft> = {}): GoalDraft => ({
  name: 'Japan trip',
  target: 80_000_00,
  saved: 42_000_00,
  ...over,
})

beforeEach(reset)

describe('setBudget', () => {
  it('writes a limit for a category in a month', async () => {
    await setBudget('2026-10', 'food', 10_000_00)

    const [budget] = await db.budgets.toArray()
    expect(budget).toMatchObject({
      month: '2026-10',
      categoryId: 'food',
      limit: 10_000_00,
      rollover: false,
    })
  })

  it('writes the whole-month budget under a null category', async () => {
    await setBudget('2026-10', null, 40_000_00)
    expect((await db.budgets.toArray())[0]?.categoryId).toBeNull()
  })

  it('replaces a limit rather than stacking a second row', async () => {
    await setBudget('2026-10', 'food', 10_000_00)
    await setBudget('2026-10', 'food', 12_000_00, true)

    const budgets = await db.budgets.toArray()
    expect(budgets).toHaveLength(1)
    expect(budgets[0]).toMatchObject({ limit: 12_000_00, rollover: true })
  })

  it('keeps months apart', async () => {
    await setBudget('2026-10', 'food', 10_000_00)
    await setBudget('2026-11', 'food', 11_000_00)
    expect(await db.budgets.count()).toBe(2)
  })

  it('removes the budget when the limit is cleared to zero', async () => {
    await setBudget('2026-10', 'food', 10_000_00)
    await setBudget('2026-10', 'food', 0)

    // A zero-limit row would read as "budgeted nothing" and make every peso
    // an overspend.
    expect(await db.budgets.count()).toBe(0)
  })

  it('does nothing when clearing a budget that was never set', async () => {
    await expect(setBudget('2026-10', 'food', 0)).resolves.toBeUndefined()
    expect(await db.budgets.count()).toBe(0)
  })

  it('refuses a negative limit', async () => {
    await expect(setBudget('2026-10', 'food', -100)).rejects.toThrow('negative')
  })
})

describe('copyBudgets', () => {
  it('brings a month over wholesale', async () => {
    await setBudget('2026-09', null, 40_000_00)
    await setBudget('2026-09', 'food', 10_000_00, true)

    expect(await copyBudgets('2026-09', '2026-10')).toBe(2)

    const october = await db.budgets.where('month').equals('2026-10').toArray()
    expect(october).toHaveLength(2)
    expect(october.find((b) => b.categoryId === 'food')).toMatchObject({
      limit: 10_000_00,
      rollover: true,
    })
  })

  it('leaves what is already budgeted alone', async () => {
    await setBudget('2026-09', 'food', 10_000_00)
    await setBudget('2026-10', 'food', 12_000_00)

    expect(await copyBudgets('2026-09', '2026-10')).toBe(0)
    expect((await db.budgets.where('month').equals('2026-10').toArray())[0]?.limit).toBe(
      12_000_00,
    )
  })

  it('copies nothing from a month with nothing in it', async () => {
    expect(await copyBudgets('2026-09', '2026-10')).toBe(0)
  })
})

describe('createGoal', () => {
  it('writes a goal with timestamps', async () => {
    const id = await createGoal(draft())
    const goal = await db.goals.get(id)

    expect(goal).toMatchObject({ name: 'Japan trip', target: 80_000_00, saved: 42_000_00 })
    expect(goal?.createdAt).toBe(goal?.updatedAt)
  })

  it('keeps a deadline when given one, and leaves it off otherwise', async () => {
    const dated = await createGoal(draft({ deadline: '2027-03-01' }))
    expect((await db.goals.get(dated))?.deadline).toBe('2027-03-01')

    const open = await createGoal(draft({ name: 'Emergency fund' }))
    expect((await db.goals.get(open))?.deadline).toBeUndefined()
  })

  it('trims the name', async () => {
    const id = await createGoal(draft({ name: '  Japan trip  ' }))
    expect((await db.goals.get(id))?.name).toBe('Japan trip')
  })

  it('insists on a name and a target', async () => {
    await expect(createGoal(draft({ name: ' ' }))).rejects.toThrow('name')
    await expect(createGoal(draft({ target: 0 }))).rejects.toThrow('saving towards')
  })
})

describe('updateGoal', () => {
  it('saves the changes', async () => {
    const id = await createGoal(draft())
    await updateGoal(id, draft({ target: 90_000_00, deadline: '2027-06-01' }))

    expect(await db.goals.get(id)).toMatchObject({
      target: 90_000_00,
      deadline: '2027-06-01',
    })
  })

  it('can clear a deadline', async () => {
    const id = await createGoal(draft({ deadline: '2027-03-01' }))
    await updateGoal(id, draft())
    expect((await db.goals.get(id))?.deadline).toBeUndefined()
  })
})

describe('addToGoal', () => {
  it('puts money in and hands back the new total', async () => {
    const id = await createGoal(draft())
    expect(await addToGoal(id, 5_000_00)).toBe(47_000_00)
    expect((await db.goals.get(id))?.saved).toBe(47_000_00)
  })

  it('takes money back out, which is how undo works', async () => {
    const id = await createGoal(draft())
    await addToGoal(id, 5_000_00)
    await addToGoal(id, -5_000_00)
    expect((await db.goals.get(id))?.saved).toBe(42_000_00)
  })

  it('never lets a goal go below nothing saved', async () => {
    const id = await createGoal(draft({ saved: 1_000_00 }))
    expect(await addToGoal(id, -5_000_00)).toBe(0)
  })

  it('lets a goal be overshot rather than capping it', async () => {
    const id = await createGoal(draft())
    expect(await addToGoal(id, 50_000_00)).toBe(92_000_00)
  })

  it('complains about a goal that is gone', async () => {
    await expect(addToGoal('nope', 100)).rejects.toThrow('no longer exists')
  })
})

describe('deleteGoal', () => {
  it('removes it and hands it back for undo', async () => {
    const id = await createGoal(draft())
    const removed = await deleteGoal(id)

    expect(await db.goals.count()).toBe(0)

    await restoreGoal(removed)
    expect((await db.goals.get(id))?.name).toBe('Japan trip')
  })

  it('complains about one that is already gone', async () => {
    await expect(deleteGoal('nope')).rejects.toThrow('already gone')
  })
})
