/**
 * Reads and writes for budgets and savings goals.
 *
 * A budget row is a limit for one category in one month; what it has left is
 * worked out from the transactions every time (CLAUDE.md § Data rules). A
 * goal is the one place a running total is stored, because money set aside
 * is not a transaction — it is a note about intent.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId, stamp, touch } from '@/db/db'
import type {
  Budget,
  Category,
  Centavos,
  DateOnly,
  Goal,
  Id,
  MonthKey,
  Transaction,
} from '@/db/types'

export interface BudgetsData {
  budgets: Budget[]
  categories: Category[]
  transactions: Transaction[]
  goals: Goal[]
}

/**
 * Budgets for every month, not just the one on screen: a rollover chain
 * reads back through earlier months, and the table is a handful of rows.
 */
export function useBudgetsData(): BudgetsData | undefined {
  return useLiveQuery(async () => {
    const [budgets, categories, transactions, goals] = await Promise.all([
      db.budgets.toArray(),
      db.categories.toArray(),
      db.transactions.toArray(),
      db.goals.toArray(),
    ])
    return { budgets, categories, transactions, goals }
  }, [])
}

/**
 * Sets a limit. A limit of zero removes the budget rather than leaving a
 * row that reads as "budgeted nothing" and makes every peso an overspend.
 */
export async function setBudget(
  month: MonthKey,
  categoryId: Id | null,
  limit: Centavos,
  rollover = false,
): Promise<void> {
  if (limit < 0) throw new Error('A budget cannot be negative')

  await db.transaction('rw', db.budgets, async () => {
    const existing = await db.budgets
      .where('month')
      .equals(month)
      .filter((budget) => budget.categoryId === categoryId)
      .first()

    if (limit === 0) {
      if (existing) await db.budgets.delete(existing.id)
      return
    }

    if (existing) {
      await db.budgets.update(existing.id, { limit, rollover, ...touch() })
      return
    }

    await db.budgets.add({ id: newId(), month, categoryId, limit, rollover, ...stamp() })
  })
}

/**
 * Copies a month's budgets onto another, for setting up a new month without
 * typing it all again. Anything already budgeted there is left alone.
 */
export async function copyBudgets(from: MonthKey, to: MonthKey): Promise<number> {
  return db.transaction('rw', db.budgets, async () => {
    const source = await db.budgets.where('month').equals(from).toArray()
    const existing = await db.budgets.where('month').equals(to).toArray()
    const taken = new Set(existing.map((budget) => budget.categoryId))

    const copies = source
      .filter((budget) => !taken.has(budget.categoryId))
      .map((budget) => ({
        id: newId(),
        month: to,
        categoryId: budget.categoryId,
        limit: budget.limit,
        rollover: budget.rollover,
        ...stamp(),
      }))

    await db.budgets.bulkAdd(copies)
    return copies.length
  })
}

export interface GoalDraft {
  name: string
  target: Centavos
  saved: Centavos
  deadline?: DateOnly
}

function checkGoal(draft: GoalDraft): void {
  if (draft.name.trim() === '') throw new Error('Give the goal a name')
  if (draft.target <= 0) throw new Error('Enter what you are saving towards')
  if (draft.saved < 0) throw new Error('Saved cannot be negative')
}

export async function createGoal(draft: GoalDraft): Promise<Id> {
  checkGoal(draft)

  const goal: Goal = {
    id: newId(),
    name: draft.name.trim(),
    target: draft.target,
    saved: draft.saved,
    ...(draft.deadline ? { deadline: draft.deadline } : {}),
    ...stamp(),
  }
  await db.goals.add(goal)
  return goal.id
}

export async function updateGoal(id: Id, draft: GoalDraft): Promise<void> {
  checkGoal(draft)

  await db.goals.update(id, {
    name: draft.name.trim(),
    target: draft.target,
    saved: draft.saved,
    deadline: draft.deadline,
    ...touch(),
  })
}

/** Puts money towards a goal, or takes it back out with a negative amount. */
export async function addToGoal(id: Id, amount: Centavos): Promise<Centavos> {
  return db.transaction('rw', db.goals, async () => {
    const goal = await db.goals.get(id)
    if (!goal) throw new Error('That goal no longer exists')

    const saved = Math.max(0, goal.saved + amount)
    await db.goals.update(id, { saved, ...touch() })
    return saved
  })
}

export async function deleteGoal(id: Id): Promise<Goal> {
  return db.transaction('rw', db.goals, async () => {
    const goal = await db.goals.get(id)
    if (!goal) throw new Error('That goal is already gone')
    await db.goals.delete(id)
    return goal
  })
}

export async function restoreGoal(goal: Goal): Promise<void> {
  await db.goals.put(goal)
}
