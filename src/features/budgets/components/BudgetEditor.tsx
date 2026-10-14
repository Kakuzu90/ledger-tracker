import { useState } from 'react'
import type { Budget, Category, MonthKey } from '@/db/types'
import { Sheet } from '@/ui/Sheet'
import { formatAmount, parseMoney } from '@/lib/money'
import { orderCategories } from '@/features/transactions/categories'
import { useUIStore } from '@/store/ui'
import { copyBudgets, setBudget } from '../db'
import { monthName } from '../budgets'
import { previousMonth } from '@/lib/budgets'

interface BudgetEditorProps {
  open: boolean
  onClose: () => void
  month: MonthKey
  budgets: readonly Budget[]
  categories: readonly Category[]
}

interface Entry {
  limit: string
  rollover: boolean
}

export function BudgetEditor(props: BudgetEditorProps) {
  return props.open ? <Form key={props.month} {...props} /> : null
}

function Form({ onClose, month, budgets, categories }: BudgetEditorProps) {
  const showSnack = useUIStore((s) => s.showSnack)

  // Parents only: a budget on Food already covers Groceries.
  const parents = orderCategories(
    categories.filter((category) => category.kind === 'expense' && !category.archived),
  ).filter((category) => category.parentId === undefined)

  const [entries, setEntries] = useState<Record<string, Entry>>(() => {
    const start: Record<string, Entry> = {}
    for (const budget of budgets) {
      if (budget.month !== month) continue
      start[budget.categoryId ?? 'overall'] = {
        limit: formatAmount(budget.limit),
        rollover: budget.rollover,
      }
    }
    return start
  })

  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const entry = (key: string): Entry => entries[key] ?? { limit: '', rollover: false }
  const update = (key: string, patch: Partial<Entry>) =>
    setEntries((current) => ({ ...current, [key]: { ...entry(key), ...patch } }))

  const onSave = async () => {
    setSaving(true)
    try {
      await setBudget(month, null, parseMoney(entry('overall').limit) ?? 0)
      for (const category of parents) {
        const { limit, rollover } = entry(category.id)
        await setBudget(month, category.id, parseMoney(limit) ?? 0, rollover)
      }
      onClose()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not save that')
      setSaving(false)
    }
  }

  const onCopy = async () => {
    const from = previousMonth(month)
    const copied = await copyBudgets(from, month)
    onClose()
    showSnack({
      message:
        copied === 0
          ? `Nothing to bring over from ${monthName(from)}`
          : `Copied ${copied} ${copied === 1 ? 'budget' : 'budgets'} from ${monthName(from)}`,
    })
  }

  return (
    <Sheet open onClose={onClose} title={`Budgets · ${monthName(month)}`}>
      <label className="block">
        <span className="label">Whole month</span>
        <input
          className="field mt-1 font-heading text-xl font-bold"
          type="text"
          inputMode="decimal"
          value={entry('overall').limit}
          onChange={(event) => update('overall', { limit: event.target.value })}
          placeholder="0.00"
        />
        <span className="mt-1 block text-meta text-muted">
          Leave it empty for no overall limit.
        </span>
      </label>

      <div>
        <span className="label">By category</span>
        <div className="mt-1.5 flex flex-col gap-2">
          {parents.map((category) => (
            <div key={category.id} className="rounded-ctl border border-border bg-surface p-3">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 flex-none rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <span className="flex-1 font-medium">{category.name}</span>
                <input
                  className="field !min-h-[40px] w-[136px] flex-none !px-2.5 text-right font-heading font-semibold"
                  type="text"
                  inputMode="decimal"
                  value={entry(category.id).limit}
                  onChange={(event) => update(category.id, { limit: event.target.value })}
                  placeholder="—"
                  aria-label={`${category.name} budget`}
                />
              </div>

              {parseMoney(entry(category.id).limit) ? (
                <label className="mt-1.5 flex items-center justify-between gap-2 text-meta text-muted">
                  Carry what is left into next month
                  <input
                    type="checkbox"
                    checked={entry(category.id).rollover}
                    onChange={(event) =>
                      update(category.id, { rollover: event.target.checked })
                    }
                    className="h-[20px] w-[20px] flex-none accent-primary"
                    aria-label={`Roll ${category.name} over`}
                  />
                </label>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <button type="button" className="btn-secondary w-full" onClick={() => void onCopy()}>
        Copy from {monthName(previousMonth(month))}
      </button>

      {problem && (
        <p role="alert" className="text-center text-meta text-negative">
          {problem}
        </p>
      )}

      <button
        type="button"
        className="btn-primary w-full disabled:opacity-50"
        disabled={saving}
        onClick={() => void onSave()}
      >
        Save budgets
      </button>
    </Sheet>
  )
}
