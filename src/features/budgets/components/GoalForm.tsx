import { useState } from 'react'
import type { Goal } from '@/db/types'
import { Sheet } from '@/ui/Sheet'
import { Money } from '@/ui/Money'
import { formatAmount, parseMoney } from '@/lib/money'
import { useUIStore } from '@/store/ui'
import { addToGoal, createGoal, deleteGoal, restoreGoal, updateGoal, type GoalDraft } from '../db'

interface GoalFormProps {
  open: boolean
  onClose: () => void
  /** Editing an existing goal, or undefined to add one. */
  goal?: Goal
}

const toDraft = (goal?: Goal): GoalDraft => ({
  name: goal?.name ?? '',
  target: goal?.target ?? 0,
  saved: goal?.saved ?? 0,
  ...(goal?.deadline ? { deadline: goal.deadline } : {}),
})

export function GoalForm(props: GoalFormProps) {
  return props.open ? <Form key={props.goal?.id ?? 'new'} {...props} /> : null
}

function Form({ onClose, goal }: GoalFormProps) {
  const showSnack = useUIStore((s) => s.showSnack)
  const [draft, setDraft] = useState<GoalDraft>(() => toDraft(goal))
  const [topUp, setTopUp] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const update = (patch: Partial<GoalDraft>) => setDraft((current) => ({ ...current, ...patch }))

  const onSave = async () => {
    try {
      if (goal) await updateGoal(goal.id, draft)
      else await createGoal(draft)
      onClose()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not save that')
    }
  }

  const onAdd = async () => {
    const amount = parseMoney(topUp)
    if (!goal || !amount) return
    try {
      await addToGoal(goal.id, amount)
      onClose()
      showSnack({
        message: 'Added to the goal',
        actionLabel: 'Undo',
        onAction: () => addToGoal(goal.id, -amount).then(() => undefined),
      })
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not add that')
    }
  }

  const onDelete = async () => {
    if (!goal) return
    try {
      const removed = await deleteGoal(goal.id)
      onClose()
      showSnack({
        message: 'Goal removed',
        actionLabel: 'Undo',
        onAction: () => restoreGoal(removed),
      })
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not remove that')
    }
  }

  return (
    <Sheet open onClose={onClose} title={goal ? 'Edit goal' : 'New goal'}>
      <label className="block">
        <span className="label">Name</span>
        <input
          className="field mt-1"
          value={draft.name}
          onChange={(event) => update({ name: event.target.value })}
          placeholder="Japan trip"
          autoFocus={!goal}
        />
      </label>

      <div className="flex gap-3">
        <label className="flex-1">
          <span className="label">Target</span>
          <input
            className="field mt-1 font-heading font-semibold"
            type="text"
            inputMode="decimal"
            defaultValue={draft.target === 0 ? '' : formatAmount(draft.target)}
            onChange={(event) => update({ target: parseMoney(event.target.value) ?? 0 })}
            placeholder="80,000.00"
          />
        </label>
        <label className="flex-1">
          <span className="label">Saved so far</span>
          <input
            className="field mt-1 font-heading font-semibold"
            type="text"
            inputMode="decimal"
            defaultValue={draft.saved === 0 ? '' : formatAmount(draft.saved)}
            onChange={(event) => update({ saved: parseMoney(event.target.value) ?? 0 })}
            placeholder="0.00"
          />
        </label>
      </div>

      <label className="block">
        <span className="label">Deadline</span>
        <input
          className="field mt-1"
          type="date"
          value={draft.deadline ?? ''}
          onChange={(event) =>
            update({ deadline: event.target.value === '' ? undefined : event.target.value })
          }
        />
        <span className="mt-1 block text-meta text-muted">
          Optional. With one, the card works out what it takes a month.
        </span>
      </label>

      {goal && (
        <div className="rounded-[16px] border border-primary/30 bg-primary-soft p-3.5">
          <p className="text-meta font-semibold text-primary">Put money in</p>
          <p className="mb-2 mt-0.5 text-meta text-muted">
            <Money value={goal.saved} compact className="font-semibold text-ink" /> saved of{' '}
            <Money value={goal.target} compact className="text-muted" />
          </p>
          <div className="flex gap-2">
            <input
              className="field"
              type="text"
              inputMode="decimal"
              value={topUp}
              onChange={(event) => setTopUp(event.target.value)}
              placeholder="5,000.00"
              aria-label="Amount to add"
            />
            <button
              type="button"
              className="btn-primary disabled:opacity-50"
              disabled={!parseMoney(topUp)}
              onClick={() => void onAdd()}
            >
              Add
            </button>
          </div>
        </div>
      )}

      {problem && (
        <p role="alert" className="text-center text-meta text-negative">
          {problem}
        </p>
      )}

      <button type="button" className="btn-primary w-full" onClick={() => void onSave()}>
        {goal ? 'Save changes' : 'Add goal'}
      </button>

      {goal && (
        <button
          type="button"
          className="btn-secondary w-full !text-negative"
          onClick={() => void onDelete()}
        >
          Delete goal
        </button>
      )}
    </Sheet>
  )
}
