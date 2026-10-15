import { useEffect, useMemo, useState } from 'react'
import { Sheet } from '@/ui/Sheet'
import { Chip } from '@/ui/Chip'
import { Segmented } from '@/ui/Segmented'
import { useUIStore } from '@/store/ui'
import { db } from '@/db/db'
import type { Id, TransactionType } from '@/db/types'
import { AmountField } from './components/AmountField'
import { AccountPicker, CategoryPicker, DatePicker, ReceiptPicker } from './components/Pickers'
import { ReceiptIcon, RepeatIcon } from '@/ui/Icon'
import { useAccounts, useCategories, useLastUsedAccountId } from './hooks/usePickers'
import { saveDraft, updateDraft } from './db'
import {
  changeType,
  draftChanged,
  draftFromTransaction,
  emptyDraft,
  hasReceipt,
  PROBLEM_MESSAGE,
  sanitizeAmount,
  SAVE_LABEL,
  validate,
  type Draft,
} from './draft'

const TYPES: ReadonlyArray<{ value: TransactionType; label: string }> = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
]

/**
 * New transaction, per design/QuickAdd.dc.html — and, with an id to edit,
 * the same sheet over an existing one. Editing reuses this rather than
 * getting a screen of its own: it is the same amount, the same pickers and
 * the same rules, and a second form would be a second set of both.
 */
export function QuickAddSheet() {
  const open = useUIStore((s) => s.quickAddOpen)
  const session = useUIStore((s) => s.quickAddSession)
  const initial = useUIStore((s) => s.quickAddInitial)
  const editId = useUIStore((s) => s.quickAddEditId)
  const close = useUIStore((s) => s.closeQuickAdd)

  if (!open) return null

  // Keyed on the session so each open starts from a clean draft, rather than
  // resetting state from an effect.
  return editId ? (
    <EditLoader key={session} id={editId} onClose={close} />
  ) : (
    <QuickAddForm key={session} initial={initial} onClose={close} />
  )
}

/**
 * Reads the entry before the form mounts, so the form itself still takes a
 * draft it owns outright and never has to reconcile one arriving late.
 */
function EditLoader({ id, onClose }: { id: Id; onClose: () => void }) {
  const [loaded, setLoaded] = useState<Draft | null>(null)

  useEffect(() => {
    let cancelled = false

    void db.transactions.get(id).then((transaction) => {
      if (cancelled) return
      // Deleted between opening the detail screen and tapping Edit.
      if (!transaction) onClose()
      else setLoaded(draftFromTransaction(transaction))
    })

    return () => {
      cancelled = true
    }
  }, [id, onClose])

  if (!loaded) {
    return (
      <Sheet open onClose={onClose} title="Edit transaction" fill>
        <div aria-hidden="true" className="h-40 animate-pulse rounded-card bg-surface" />
      </Sheet>
    )
  }

  return <QuickAddForm editId={id} initialDraft={loaded} onClose={onClose} />
}

function QuickAddForm({
  initial,
  initialDraft,
  editId,
  onClose,
}: {
  initial?: Partial<Draft> | null
  /** The whole draft, when editing an entry that has been read already. */
  initialDraft?: Draft
  editId?: Id
  onClose: () => void
}) {
  const today = useMemo(() => new Date(), [])
  const [draft, setDraft] = useState<Draft>(
    () => initialDraft ?? { ...emptyDraft(today), ...initial },
  )
  const [saving, setSaving] = useState(false)
  const [showProblem, setShowProblem] = useState(false)
  /** A refusal from the write itself, as opposed to a field being empty. */
  const [failure, setFailure] = useState<string | null>(null)

  const accounts = useAccounts()
  const lastUsed = useLastUsedAccountId()
  const categories = useCategories(draft.type === 'income' ? 'income' : 'expense')

  // The last-used account stands in until the user picks one — derived
  // rather than written into state, so there is nothing to synchronise.
  const current: Draft = {
    ...draft,
    accountId: draft.accountId ?? lastUsed ?? accounts?.[0]?.id,
  }
  const problem = validate(current)

  // Worth a confirmation before the backdrop throws it away. A type or a
  // date on their own are just the defaults. When editing, everything is
  // filled in from the start, so what matters is whether it has moved.
  const editing = editId !== undefined
  const dirty = editing
    ? initialDraft !== undefined && draftChanged(draft, initialDraft)
    : draft.amountInput !== '' ||
      draft.note !== '' ||
      draft.categoryId !== undefined ||
      draft.receipt !== undefined

  const update = (patch: Partial<Draft>) => setDraft((draft) => ({ ...draft, ...patch }))

  const onSave = async () => {
    if (problem) {
      setShowProblem(true)
      return
    }

    setSaving(true)
    setFailure(null)
    try {
      if (editId) await updateDraft(editId, current)
      else await saveDraft(current)
      onClose()
    } catch (error) {
      // Says what went wrong. Before, a refused write showed the *validation*
      // message — which is blank whenever the form itself is valid, so a
      // failed save looked like nothing happening at all.
      setSaving(false)
      setFailure(error instanceof Error ? error.message : 'That could not be saved')
    }
  }

  const onPickReceipt = (file: File | null) => {
    if (!file) return
    update({
      receipt: { blob: file, mime: file.type || 'image/jpeg', size: file.size },
    })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? 'Edit transaction' : 'New transaction'}
      fill
      confirmDiscard={dirty}
      {...(editing
        ? {
            discardCopy: {
              title: 'Discard your changes?',
              detail: 'This entry will stay as it was.',
            },
          }
        : {})}
      action={
        <label className="icon-btn relative cursor-pointer">
          <ReceiptIcon />
          <input
            type="file"
            accept="image/*"
            aria-label="Scan receipt"
            onChange={(event) => onPickReceipt(event.target.files?.[0] ?? null)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      }
    >
      {/*
        One scroll region holding everything but the Save button. The
        keypad used to be pinned too, and on a 375x667 phone the fixed
        blocks added up past the sheet: the category chips collapsed to
        nothing and Save fell 80px below the fold with no way to reach it.
        Only the action is pinned now, so it is always in sight.
      */}
      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 short:gap-2">
        <Segmented
          label="Type"
          options={TYPES}
          value={current.type}
          onChange={(type) => setDraft((draft) => changeType(draft, type))}
        />

        <AmountField
          value={current.amountInput}
          type={current.type}
          onChange={(next) => update({ amountInput: sanitizeAmount(next) })}
        />

        {/*
          Account and date come before the categories, not after: below the
          chips they were off screen behind an inner scrollbar, and the
          account decides which balance moves.
        */}
        <div className="flex flex-none flex-wrap gap-2">
          <AccountPicker
            label={current.type === 'transfer' ? 'From' : 'Account'}
            accounts={accounts ?? []}
            value={current.accountId}
            onChange={(accountId) => update({ accountId })}
          />

          {current.type === 'transfer' && (
            <AccountPicker
              label="To"
              accounts={accounts ?? []}
              value={current.toAccountId}
              onChange={(toAccountId) => update({ toAccountId })}
            />
          )}

          <DatePicker value={current.date} onChange={(date) => update({ date })} today={today} />

          {!editing && (
            <Chip active={current.repeat} onClick={() => update({ repeat: !current.repeat })}>
              <RepeatIcon />
              {current.repeat ? 'Repeats monthly' : 'Repeat'}
            </Chip>
          )}

          <ReceiptPicker
            attached={hasReceipt(current)}
            onPick={onPickReceipt}
            {...(hasReceipt(current)
              ? { onClear: () => update({ receipt: undefined, receiptId: undefined }) }
              : {})}
          />
        </div>

        {current.type !== 'transfer' && (
          <CategoryPicker
            categories={categories ?? []}
            value={current.categoryId}
            onChange={(categoryId) => update({ categoryId })}
          />
        )}

        {/* The note sits with the keypad: it is typed, not browsed. */}
        <label htmlFor="qa-note" className="sr-only">
          Note and tags
        </label>
        <input
          id="qa-note"
          className="field flex-none"
          type="text"
          value={current.note}
          onChange={(event) => update({ note: event.target.value })}
          placeholder="Add a note or #tag"
        />
      </div>

      {/* Pinned: the action, and anything standing between it and saving. */}
      <div className="flex flex-none flex-col gap-3 pt-3 short:gap-2 short:pt-2">
        {(failure ?? (showProblem && problem ? PROBLEM_MESSAGE[problem] : null)) && (
          <p role="alert" className="text-center text-meta text-negative">
            {failure ?? (problem ? PROBLEM_MESSAGE[problem] : null)}
          </p>
        )}

        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="btn-primary min-h-[52px] w-full text-base disabled:opacity-60"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : SAVE_LABEL[current.type]}
        </button>
      </div>
    </Sheet>
  )
}
