import { beforeEach, describe, expect, it } from 'vitest'
import { db, newId, stamp } from '@/db/db'
import type { Account, Id, Recurring } from '@/db/types'
import { accountBalance } from '@/lib/balances'
import { confirmPending, skipPending } from '@/features/transactions/db'
import {
  createRule,
  deleteRule,
  restoreRule,
  runSchedule,
  setRuleMode,
  updateRule,
  type RuleDraft,
} from './db'

const TODAY = new Date(2026, 9, 14)

const reset = async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
}

const account = async (name = 'GCash', openingBalance = 10_000_00): Promise<Id> => {
  const row: Account = {
    id: newId(),
    name,
    type: 'ewallet',
    currency: 'PHP',
    openingBalance,
    color: '#2C6E8A',
    archived: false,
    ...stamp(),
  }
  await db.accounts.add(row)
  return row.id
}

const balance = async (id: Id): Promise<number> =>
  accountBalance((await db.accounts.get(id)) as Account, await db.transactions.toArray())

const addRule = async (over: Partial<Recurring> & { accountId: Id; amount?: number }) => {
  const { accountId, amount = 149_00, ...rest } = over
  const rule: Recurring = {
    id: newId(),
    template: { type: 'expense', amount, accountId, note: 'Spotify', tags: [] },
    freq: 'monthly',
    interval: 1,
    startDate: '2026-04-14',
    nextDate: '2026-10-14',
    mode: 'confirm',
    ...stamp(),
    ...rest,
  }
  await db.recurring.add(rule)
  return rule
}

const draft = (accountId: Id, over: Partial<RuleDraft> = {}): RuleDraft => ({
  note: 'Internet',
  amount: 1_699_00,
  type: 'expense',
  accountId,
  freq: 'monthly',
  interval: 1,
  nextDate: '2026-11-01',
  mode: 'confirm',
  subscription: false,
  ...over,
})

beforeEach(reset)

describe('runSchedule', () => {
  it('does nothing when nothing is due', async () => {
    const accountId = await account()
    await addRule({ accountId, nextDate: '2026-10-20' })

    expect(await runSchedule(TODAY)).toEqual({ posted: 0, pending: 0, capped: 0 })
    expect(await db.transactions.count()).toBe(0)
  })

  it('posts an auto rule straight into the ledger', async () => {
    const accountId = await account()
    const rule = await addRule({ accountId, mode: 'auto' })

    expect(await runSchedule(TODAY)).toMatchObject({ posted: 1, pending: 0 })

    const [posted] = await db.transactions.toArray()
    expect(posted).toMatchObject({
      status: 'posted',
      amount: 149_00,
      note: 'Spotify',
      date: '2026-10-14',
      recurringId: rule.id,
    })
    expect(await balance(accountId)).toBe(9_851_00)
  })

  it('parks a confirm rule without touching the balance', async () => {
    const accountId = await account()
    await addRule({ accountId, mode: 'confirm' })

    expect(await runSchedule(TODAY)).toMatchObject({ posted: 0, pending: 1 })

    expect((await db.transactions.toArray())[0]?.status).toBe('pending')
    expect(await balance(accountId)).toBe(10_000_00)
  })

  it('copies the template, category and tags onto the entry', async () => {
    const accountId = await account()
    await addRule({
      accountId,
      mode: 'auto',
      template: {
        type: 'expense',
        amount: 549_00,
        accountId,
        note: 'Netflix',
        tags: ['subscription'],
        categoryId: 'bills',
      },
    })

    await runSchedule(TODAY)

    expect((await db.transactions.toArray())[0]).toMatchObject({
      note: 'Netflix',
      tags: ['subscription'],
      categoryId: 'bills',
    })
  })

  it('moves the rule on, so a second run has nothing to do', async () => {
    const accountId = await account()
    const rule = await addRule({ accountId, mode: 'auto' })

    await runSchedule(TODAY)
    expect((await db.recurring.get(rule.id))?.nextDate).toBe('2026-11-14')

    expect(await runSchedule(TODAY)).toEqual({ posted: 0, pending: 0, capped: 0 })
    expect(await db.transactions.count()).toBe(1)
  })

  it('does not double-post when two runs overlap', async () => {
    const accountId = await account()
    await addRule({ accountId, mode: 'auto' })

    // What React's double effect does in dev, and two tabs do in the wild.
    await Promise.all([runSchedule(TODAY), runSchedule(TODAY)])

    expect(await db.transactions.count()).toBe(1)
  })

  it('catches up on everything missed while the app was shut', async () => {
    const accountId = await account()
    await addRule({ accountId, mode: 'auto', nextDate: '2026-07-14' })

    expect(await runSchedule(TODAY)).toMatchObject({ posted: 4 })
    expect((await db.transactions.toArray()).map((t) => t.date).sort()).toEqual([
      '2026-07-14',
      '2026-08-14',
      '2026-09-14',
      '2026-10-14',
    ])
    expect(await balance(accountId)).toBe(10_000_00 - 4 * 149_00)
  })

  it('stops a rule at its end date', async () => {
    const accountId = await account()
    const rule = await addRule({
      accountId,
      mode: 'auto',
      nextDate: '2026-08-14',
      endDate: '2026-09-30',
    })

    expect(await runSchedule(TODAY)).toMatchObject({ posted: 2 })
    expect((await db.recurring.get(rule.id))?.nextDate).toBe('2026-10-14')
    // Past its end, so the next run leaves it alone.
    expect(await runSchedule(TODAY)).toMatchObject({ posted: 0 })
  })

  it('handles a mixed set in one pass', async () => {
    const accountId = await account()
    await addRule({ accountId, mode: 'auto', amount: 15_000_00 })
    await addRule({ accountId, mode: 'confirm' })
    await addRule({ accountId, nextDate: '2026-12-01' })

    expect(await runSchedule(TODAY)).toEqual({ posted: 1, pending: 1, capped: 0 })
  })
})

describe('a confirm rule through to a decision', () => {
  it('posts on a yes, and the rule still points at next month', async () => {
    const accountId = await account()
    const rule = await addRule({ accountId, mode: 'confirm' })
    await runSchedule(TODAY)

    const pending = (await db.transactions.toArray())[0]
    await confirmPending(pending!.id)

    expect((await db.transactions.get(pending!.id))?.status).toBe('posted')
    expect((await db.recurring.get(rule.id))?.nextDate).toBe('2026-11-14')
    expect(await balance(accountId)).toBe(9_851_00)
  })

  it('leaves nothing behind on a skip, and does not re-make it', async () => {
    const accountId = await account()
    await addRule({ accountId, mode: 'confirm' })
    await runSchedule(TODAY)

    await skipPending((await db.transactions.toArray())[0]!.id)
    expect(await db.transactions.count()).toBe(0)

    // The occurrence was consumed; only next month's is still to come.
    await runSchedule(TODAY)
    expect(await db.transactions.count()).toBe(0)
  })
})

describe('createRule', () => {
  it('writes a rule starting where it is told to', async () => {
    const accountId = await account()
    const id = await createRule(draft(accountId))
    const rule = await db.recurring.get(id)

    expect(rule).toMatchObject({
      freq: 'monthly',
      interval: 1,
      nextDate: '2026-11-01',
      startDate: '2026-11-01',
      mode: 'confirm',
    })
    expect(rule?.template).toMatchObject({ note: 'Internet', amount: 1_699_00, tags: [] })
  })

  it('tags a subscription so it counts towards the monthly total', async () => {
    const accountId = await account()
    const id = await createRule(draft(accountId, { subscription: true }))
    expect((await db.recurring.get(id))?.template.tags).toEqual(['subscription'])
  })

  it('never lets the interval fall below one', async () => {
    const accountId = await account()
    const id = await createRule(draft(accountId, { interval: 0 }))
    expect((await db.recurring.get(id))?.interval).toBe(1)
  })

  it('insists on a name, an amount and an account', async () => {
    const accountId = await account()
    await expect(createRule(draft(accountId, { note: '  ' }))).rejects.toThrow('name')
    await expect(createRule(draft(accountId, { amount: 0 }))).rejects.toThrow('how much')
    await expect(createRule(draft('' as Id))).rejects.toThrow('account')
  })

  it('refuses an end date that is already past the next payment', async () => {
    const accountId = await account()
    await expect(
      createRule(draft(accountId, { endDate: '2026-10-01' })),
    ).rejects.toThrow('end date')
  })
})

describe('updateRule', () => {
  it('saves the changes and leaves what it has already produced alone', async () => {
    const accountId = await account()
    const rule = await addRule({ accountId, mode: 'auto' })
    await runSchedule(TODAY)

    await updateRule(rule.id, draft(accountId, { note: 'Spotify Duo', amount: 199_00 }))

    expect((await db.recurring.get(rule.id))?.template).toMatchObject({
      note: 'Spotify Duo',
      amount: 199_00,
    })
    // The entry that already posted still says what was actually paid.
    expect((await db.transactions.toArray())[0]?.amount).toBe(149_00)
  })

  it('can clear an end date', async () => {
    const accountId = await account()
    const rule = await addRule({ accountId, endDate: '2026-12-01' })

    await updateRule(rule.id, draft(accountId))

    expect((await db.recurring.get(rule.id))?.endDate).toBeUndefined()
  })
})

describe('setRuleMode', () => {
  it('switches a rule between asking and deciding for itself', async () => {
    const accountId = await account()
    const rule = await addRule({ accountId })

    await setRuleMode(rule.id, 'auto')
    expect((await db.recurring.get(rule.id))?.mode).toBe('auto')
  })
})

describe('deleteRule', () => {
  it('takes undecided entries with it but keeps what was paid', async () => {
    const accountId = await account()
    const rule = await addRule({ accountId, mode: 'auto', nextDate: '2026-09-14' })
    await runSchedule(TODAY)
    await db.recurring.update(rule.id, { mode: 'confirm', nextDate: '2026-10-14' })
    await runSchedule(TODAY)

    const posted = await db.transactions.filter((t) => t.status === 'posted').count()
    expect(posted).toBe(2)

    const deleted = await deleteRule(rule.id)

    expect(deleted.pending).toHaveLength(1)
    expect(await db.recurring.get(rule.id)).toBeUndefined()
    expect(await db.transactions.count()).toBe(2)
  })

  it('puts everything back on undo', async () => {
    const accountId = await account()
    const rule = await addRule({ accountId, mode: 'confirm' })
    await runSchedule(TODAY)

    await restoreRule(await deleteRule(rule.id))

    expect(await db.recurring.get(rule.id)).toBeDefined()
    expect(await db.transactions.count()).toBe(1)
  })

  it('complains about a rule that is already gone', async () => {
    await expect(deleteRule('nope')).rejects.toThrow('already gone')
  })
})
