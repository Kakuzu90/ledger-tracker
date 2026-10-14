import { useState } from 'react'
import type { Account, Category, Recurring, RecurringFreq, RecurringMode } from '@/db/types'
import { Sheet } from '@/ui/Sheet'
import { Chip } from '@/ui/Chip'
import { Segmented } from '@/ui/Segmented'
import { Toggle } from '@/ui/Toggle'
import { formatAmount, parseMoney } from '@/lib/money'
import { toDateOnly } from '@/lib/dates'
import { orderCategories } from '@/features/transactions/categories'
import { useUIStore } from '@/store/ui'
import { createRule, deleteRule, restoreRule, updateRule, type RuleDraft } from '../db'
import { SUBSCRIPTION_TAG } from '../bills'

const FREQS: ReadonlyArray<{ value: RecurringFreq; label: string }> = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

const MODES: ReadonlyArray<{ value: RecurringMode; label: string }> = [
  { value: 'confirm', label: 'Ask first' },
  { value: 'auto', label: 'Add it for me' },
]

interface RuleFormProps {
  open: boolean
  onClose: () => void
  /** Editing an existing rule, or undefined to add one. */
  rule?: Recurring
  accounts: readonly Account[]
  categories: readonly Category[]
}

const toDraft = (rule: Recurring | undefined, accounts: readonly Account[]): RuleDraft => ({
  note: rule?.template.note ?? '',
  amount: rule?.template.amount ?? 0,
  type: rule?.template.type === 'income' ? 'income' : 'expense',
  accountId: rule?.template.accountId ?? accounts[0]?.id ?? '',
  ...(rule?.template.categoryId ? { categoryId: rule.template.categoryId } : {}),
  freq: rule?.freq ?? 'monthly',
  interval: rule?.interval ?? 1,
  nextDate: rule?.nextDate ?? toDateOnly(new Date()),
  ...(rule?.endDate ? { endDate: rule.endDate } : {}),
  mode: rule?.mode ?? 'confirm',
  subscription: rule?.template.tags.includes(SUBSCRIPTION_TAG) ?? false,
})

export function RuleForm(props: RuleFormProps) {
  return props.open ? <Form key={props.rule?.id ?? 'new'} {...props} /> : null
}

function Form({ onClose, rule, accounts, categories }: RuleFormProps) {
  const showSnack = useUIStore((s) => s.showSnack)
  const [draft, setDraft] = useState<RuleDraft>(() => toDraft(rule, accounts))
  const [problem, setProblem] = useState<string | null>(null)

  const update = (patch: Partial<RuleDraft>) => setDraft((current) => ({ ...current, ...patch }))

  const expenseCategories = orderCategories(
    categories.filter((category) => category.kind === draft.type && !category.archived),
  )

  const onSave = async () => {
    try {
      if (rule) await updateRule(rule.id, draft)
      else await createRule(draft)
      onClose()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not save that')
    }
  }

  const onDelete = async () => {
    if (!rule) return
    try {
      const deleted = await deleteRule(rule.id)
      onClose()
      showSnack({
        message: 'Rule removed',
        actionLabel: 'Undo',
        onAction: () => restoreRule(deleted),
      })
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not remove that')
    }
  }

  return (
    <Sheet open onClose={onClose} title={rule ? 'Edit recurring' : 'New recurring'}>
      <label className="block">
        <span className="label">Name</span>
        <input
          className="field mt-1"
          value={draft.note}
          onChange={(event) => update({ note: event.target.value })}
          placeholder="Internet"
          autoFocus={!rule}
        />
      </label>

      <label className="block">
        <span className="label">Amount</span>
        <input
          className="field mt-1 font-heading text-xl font-bold"
          type="text"
          inputMode="decimal"
          defaultValue={draft.amount === 0 ? '' : formatAmount(draft.amount)}
          onChange={(event) => update({ amount: parseMoney(event.target.value) ?? 0 })}
          placeholder="0.00"
        />
      </label>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <span className="label">Repeats</span>
          <div className="mt-1.5">
            <Segmented
              label="Frequency"
              options={FREQS}
              value={draft.freq}
              onChange={(freq) => update({ freq })}
            />
          </div>
        </div>
        <label className="w-[84px]">
          <span className="label">Every</span>
          <input
            className="field mt-1 text-center"
            type="number"
            inputMode="numeric"
            min={1}
            value={draft.interval}
            onChange={(event) => update({ interval: Number(event.target.value) || 1 })}
            aria-label="Interval"
          />
        </label>
      </div>

      <div className="flex gap-3">
        <label className="flex-1">
          <span className="label">Next payment</span>
          <input
            className="field mt-1"
            type="date"
            value={draft.nextDate}
            onChange={(event) => update({ nextDate: event.target.value })}
          />
        </label>
        <label className="flex-1">
          <span className="label">Ends</span>
          <input
            className="field mt-1"
            type="date"
            value={draft.endDate ?? ''}
            onChange={(event) =>
              update({ endDate: event.target.value === '' ? undefined : event.target.value })
            }
          />
        </label>
      </div>

      <div>
        <span className="label">From</span>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {accounts.map((account) => (
            <Chip
              key={account.id}
              active={account.id === draft.accountId}
              dot={account.color}
              onClick={() => update({ accountId: account.id })}
            >
              {account.name}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <span className="label">Category</span>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {expenseCategories.map((category) => (
            <Chip
              key={category.id}
              active={category.id === draft.categoryId}
              dot={category.color}
              onClick={() =>
                update({
                  categoryId: category.id === draft.categoryId ? undefined : category.id,
                })
              }
            >
              {category.name}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <span className="label">When it comes due</span>
        <div className="mt-1.5">
          <Segmented
            label="Mode"
            options={MODES}
            value={draft.mode}
            onChange={(mode) => update({ mode })}
          />
        </div>
        <p className="mt-1.5 text-meta text-muted">
          {draft.mode === 'auto'
            ? 'It posts on its own the next time you open Ledger.'
            : 'It waits in Activity for a yes before it touches a balance.'}
        </p>
      </div>

      <div className="rounded-[16px] border border-border bg-surface px-4">
        <Toggle
          checked={draft.subscription}
          onChange={(subscription) => update({ subscription })}
          label="Subscription"
          hint="Counts towards the monthly subscriptions total"
        />
      </div>

      {problem && (
        <p role="alert" className="text-center text-meta text-negative">
          {problem}
        </p>
      )}

      <button type="button" className="btn-primary w-full" onClick={() => void onSave()}>
        {rule ? 'Save changes' : 'Add recurring'}
      </button>

      {rule && (
        <button
          type="button"
          className="btn-secondary w-full !text-negative"
          onClick={() => void onDelete()}
        >
          Delete rule
        </button>
      )}
    </Sheet>
  )
}
