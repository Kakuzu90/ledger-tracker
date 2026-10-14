/**
 * The recurring scheduler, and the reads and writes behind Bills.
 *
 * `runSchedule` is the only thing that moves a rule's `nextDate`. It
 * materialises an occurrence and advances the rule in the same Dexie
 * transaction, which is what makes a second run — a double effect in dev, two
 * tabs, a reload — find nothing left to do instead of posting twice.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId, stamp, touch } from '@/db/db'
import type {
  Account,
  Category,
  DateOnly,
  Id,
  Recurring,
  RecurringFreq,
  RecurringMode,
  RecurringTemplate,
  Transaction,
} from '@/db/types'
import { planSchedule } from '@/lib/recurring'
import { toDateOnly } from '@/lib/dates'
import { notify, reminderText } from '@/lib/notifications'
import { getSetting, setSetting } from '@/db/settings'
import { buildBillsView, dueSoon } from './bills'

export interface ScheduleResult {
  /** Auto rules that went straight into the ledger. */
  posted: number
  /** Confirm rules now waiting on a yes. */
  pending: number
  /** Rules that hit the catch-up cap; the rest follows on the next open. */
  capped: number
}

/**
 * Runs every occurrence that has come due. Auto rules post; confirm rules
 * land as pending entries for the user to accept or skip.
 */
export async function runSchedule(today: Date = new Date()): Promise<ScheduleResult> {
  const todayIso = toDateOnly(today)

  return db.transaction('rw', db.recurring, db.transactions, async () => {
    const rules = await db.recurring.toArray()
    const plan = planSchedule(rules, todayIso)
    if (plan.occurrences.length === 0) {
      return { posted: 0, pending: 0, capped: 0 }
    }

    const ruleById = new Map(rules.map((rule) => [rule.id, rule]))
    const rows: Transaction[] = []

    for (const occurrence of plan.occurrences) {
      const rule = ruleById.get(occurrence.ruleId)
      if (!rule) continue

      rows.push({
        id: newId(),
        ...rule.template,
        date: occurrence.date,
        recurringId: rule.id,
        status: occurrence.status,
        ...stamp(),
      })
    }

    await db.transactions.bulkAdd(rows)
    for (const { ruleId, nextDate } of plan.nextDates) {
      await db.recurring.update(ruleId, { nextDate, ...touch() })
    }

    return {
      posted: rows.filter((row) => row.status === 'posted').length,
      pending: rows.filter((row) => row.status === 'pending').length,
      capped: plan.capped.length,
    }
  })
}

export interface BillsData {
  rules: Recurring[]
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
}

/**
 * Pending rows and anything a rule has produced. The whole transaction table
 * is not needed here: the forecast only cares about what the rules did.
 */
export function useBillsData(): BillsData | undefined {
  return useLiveQuery(async () => {
    const [rules, accounts, categories, transactions] = await Promise.all([
      db.recurring.toArray(),
      db.accounts.toArray(),
      db.categories.toArray(),
      db.transactions.filter((txn) => txn.status === 'pending' || txn.recurringId !== undefined)
        .toArray(),
    ])

    return {
      rules,
      accounts: accounts.filter((account) => !account.archived),
      categories,
      transactions,
    }
  }, [])
}

export interface RuleDraft {
  note: string
  amount: number
  type: 'expense' | 'income'
  accountId: Id
  categoryId?: Id
  freq: RecurringFreq
  interval: number
  nextDate: DateOnly
  endDate?: DateOnly
  mode: RecurringMode
  /** Counts towards the subscriptions total. */
  subscription: boolean
}

const SUBSCRIPTION_TAG = 'subscription'

function toTemplate(draft: RuleDraft): RecurringTemplate {
  return {
    type: draft.type,
    amount: draft.amount,
    accountId: draft.accountId,
    note: draft.note.trim(),
    tags: draft.subscription ? [SUBSCRIPTION_TAG] : [],
    ...(draft.categoryId ? { categoryId: draft.categoryId } : {}),
  }
}

function check(draft: RuleDraft): void {
  if (draft.note.trim() === '') throw new Error('Give the bill a name')
  if (draft.amount <= 0) throw new Error('Enter how much it is for')
  if (!draft.accountId) throw new Error('Choose an account')
  if (draft.endDate !== undefined && draft.endDate < draft.nextDate) {
    throw new Error('The end date is before the next payment')
  }
}

export async function createRule(draft: RuleDraft): Promise<Id> {
  check(draft)

  const rule: Recurring = {
    id: newId(),
    template: toTemplate(draft),
    freq: draft.freq,
    interval: Math.max(1, Math.round(draft.interval)),
    startDate: draft.nextDate,
    nextDate: draft.nextDate,
    ...(draft.endDate ? { endDate: draft.endDate } : {}),
    mode: draft.mode,
    ...stamp(),
  }

  await db.recurring.add(rule)
  return rule.id
}

/**
 * Edits a rule. Entries it has already produced are left alone — they are
 * what happened, not what the rule now says should happen.
 */
export async function updateRule(id: Id, draft: RuleDraft): Promise<void> {
  check(draft)

  await db.recurring.update(id, {
    template: toTemplate(draft),
    freq: draft.freq,
    interval: Math.max(1, Math.round(draft.interval)),
    nextDate: draft.nextDate,
    endDate: draft.endDate,
    mode: draft.mode,
    ...touch(),
  })
}

export async function setRuleMode(id: Id, mode: RecurringMode): Promise<void> {
  await db.recurring.update(id, { mode, ...touch() })
}

export interface DeletedRule {
  rule: Recurring
  /** Undecided entries that went with it. */
  pending: Transaction[]
}

/**
 * Stops a rule. Posted entries stay — the money moved — but anything still
 * waiting on a yes goes with it, since there is no longer a rule behind it.
 */
export async function deleteRule(id: Id): Promise<DeletedRule> {
  return db.transaction('rw', db.recurring, db.transactions, async () => {
    const rule = await db.recurring.get(id)
    if (!rule) throw new Error('That rule is already gone')

    const pending = await db.transactions
      .where('recurringId')
      .equals(id)
      .filter((txn) => txn.status === 'pending')
      .toArray()

    await db.transactions.bulkDelete(pending.map((txn) => txn.id))
    await db.recurring.delete(id)

    return { rule, pending }
  })
}

/** Puts back exactly what `deleteRule` removed. */
export async function restoreRule(deleted: DeletedRule): Promise<void> {
  await db.transaction('rw', db.recurring, db.transactions, async () => {
    await db.recurring.put(deleted.rule)
    if (deleted.pending.length > 0) await db.transactions.bulkPut(deleted.pending)
  })
}

/**
 * Raises a system notice for anything due within a day, once per day.
 *
 * This runs on open because that is the only moment an app with no server
 * gets. It is deliberately quiet: off unless the user turned it on, and never
 * twice in the same day.
 */
export async function remindAboutBills(today: Date = new Date()): Promise<boolean> {
  if (!(await getSetting('billReminders', false))) return false

  const todayIso = toDateOnly(today)
  if ((await getSetting<string | null>('lastBillNotice', null)) === todayIso) return false

  const [rules, accounts, categories, transactions] = await Promise.all([
    db.recurring.toArray(),
    db.accounts.toArray(),
    db.categories.toArray(),
    db.transactions.filter((txn) => txn.status === 'pending' || txn.recurringId !== undefined)
      .toArray(),
  ])

  const soon = dueSoon(buildBillsView({ rules, accounts, categories, transactions }, today), 1, today)
  if (soon.length === 0) return false

  // Recorded either way: a notice the browser refused is still one asked for,
  // and retrying it on every navigation would be worse than missing it.
  await setSetting('lastBillNotice', todayIso)
  return notify('Ledger', reminderText(soon.map((row) => row.title)))
}
