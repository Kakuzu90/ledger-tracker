import { useMemo, useState } from 'react'
import { Sheet } from '@/ui/Sheet'
import { Chip } from '@/ui/Chip'
import { Segmented } from '@/ui/Segmented'
import { useUIStore } from '@/store/ui'
import type { TransactionType } from '@/db/types'
import { AmountDisplay, Keypad } from './components/Keypad'
import { AccountPicker, CategoryPicker, DatePicker, ReceiptPicker } from './components/Pickers'
import { ReceiptIcon, RepeatIcon } from '@/ui/Icon'
import { useAccounts, useCategories, useLastUsedAccountId } from './hooks/usePickers'
import { saveDraft } from './db'
import {
  changeType,
  emptyDraft,
  PROBLEM_MESSAGE,
  pressKey,
  SAVE_LABEL,
  validate,
  type Draft,
} from './draft'

const TYPES: ReadonlyArray<{ value: TransactionType; label: string }> = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
]

/** New transaction, per design/QuickAdd.dc.html. */
export function QuickAddSheet() {
  const open = useUIStore((s) => s.quickAddOpen)
  const session = useUIStore((s) => s.quickAddSession)
  const close = useUIStore((s) => s.closeQuickAdd)

  // Keyed on the session so each open starts from a clean draft, rather than
  // resetting state from an effect.
  return open ? <QuickAddForm key={session} onClose={close} /> : null
}

function QuickAddForm({ onClose }: { onClose: () => void }) {
  const today = useMemo(() => new Date(), [])
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(today))
  const [saving, setSaving] = useState(false)
  const [showProblem, setShowProblem] = useState(false)

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

  const update = (patch: Partial<Draft>) => setDraft((draft) => ({ ...draft, ...patch }))

  const onSave = async () => {
    if (problem) {
      setShowProblem(true)
      return
    }

    setSaving(true)
    try {
      await saveDraft(current)
      onClose()
    } catch {
      setSaving(false)
      setShowProblem(true)
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
      title="New transaction"
      fill
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
      <Segmented
        label="Type"
        options={TYPES}
        value={current.type}
        onChange={(type) => setDraft((draft) => changeType(draft, type))}
      />

      <AmountDisplay input={current.amountInput} type={current.type} />

      {/* Only the pickers scroll; the amount and keypad stay put. */}
      <div className="-mx-1 flex flex-1 flex-col gap-3 overflow-y-auto px-1">
        {current.type !== 'transfer' && (
          <CategoryPicker
            categories={categories ?? []}
            value={current.categoryId}
            onChange={(categoryId) => update({ categoryId })}
          />
        )}

        <div className="flex flex-wrap gap-2">
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

          <Chip active={current.repeat} onClick={() => update({ repeat: !current.repeat })}>
            <RepeatIcon />
            {current.repeat ? 'Repeats monthly' : 'Repeat'}
          </Chip>

          <ReceiptPicker attached={current.receipt !== undefined} onPick={onPickReceipt} />
        </div>
      </div>

      {/* The note stays with the keypad: it is typed, not browsed. */}
      <div className="flex flex-none flex-col gap-3">
        <label htmlFor="qa-note" className="sr-only">
          Note and tags
        </label>
        <input
          id="qa-note"
          className="field"
          type="text"
          value={current.note}
          onChange={(event) => update({ note: event.target.value })}
          placeholder="Add a note or #tag"
        />

        {showProblem && problem && (
          <p role="alert" className="text-center text-meta text-negative">
            {PROBLEM_MESSAGE[problem]}
          </p>
        )}

        <Keypad onPress={(key) => update({ amountInput: pressKey(current.amountInput, key) })} />

        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="btn-primary min-h-[52px] w-full text-base disabled:opacity-60"
        >
          {saving ? 'Saving…' : SAVE_LABEL[current.type]}
        </button>
      </div>
    </Sheet>
  )
}
