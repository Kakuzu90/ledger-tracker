import { useState } from 'react'
import type { Account, AccountType } from '@/db/types'
import { Sheet } from '@/ui/Sheet'
import { Segmented } from '@/ui/Segmented'
import { formatAmount, parseMoney } from '@/lib/money'
import { createAccount, deleteAccount, setArchived, updateAccount, type AccountDraft } from '../db'

const TYPES: ReadonlyArray<{ value: AccountType; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'ewallet', label: 'E-wallet' },
  { value: 'credit', label: 'Card' },
]

/** Same palette the categories draw from. */
const COLORS = [
  '#1D4E89',
  '#0F6E64',
  '#E07A3F',
  '#8A2452',
  '#4B3A8C',
  '#7A6A3F',
  '#2C6E8A',
  '#5B616B',
] as const

const toDraft = (account?: Account): AccountDraft => ({
  name: account?.name ?? '',
  type: account?.type ?? 'bank',
  color: account?.color ?? COLORS[0],
  // A card's balance is held negative; the form asks what is owed.
  openingBalance: account ? Math.abs(account.openingBalance) : 0,
  ...(account?.creditLimit !== undefined ? { creditLimit: account.creditLimit } : {}),
  ...(account?.statementDay !== undefined ? { statementDay: account.statementDay } : {}),
  ...(account?.dueDay !== undefined ? { dueDay: account.dueDay } : {}),
})

interface AccountFormProps {
  open: boolean
  onClose: () => void
  /** Editing an existing account, or undefined to add one. */
  account?: Account
}

export function AccountForm({ open, onClose, account }: AccountFormProps) {
  return open ? (
    <Form key={account?.id ?? 'new'} onClose={onClose} account={account} />
  ) : null
}

function Form({ onClose, account }: { onClose: () => void; account?: Account }) {
  const [draft, setDraft] = useState<AccountDraft>(() => toDraft(account))
  const [problem, setProblem] = useState<string | null>(null)
  const isCard = draft.type === 'credit'

  const update = (patch: Partial<AccountDraft>) =>
    setDraft((current) => ({ ...current, ...patch }))

  const money = (raw: string) => parseMoney(raw) ?? 0
  const day = (raw: string): number | undefined => {
    const value = Number(raw)
    return Number.isInteger(value) && value >= 1 && value <= 31 ? value : undefined
  }

  const onSave = async () => {
    if (draft.name.trim() === '') {
      setProblem('Give the account a name')
      return
    }

    const named = { ...draft, name: draft.name.trim() }
    if (account) await updateAccount(account.id, named)
    else await createAccount(named)
    onClose()
  }

  const onDelete = async () => {
    if (!account) return
    try {
      await deleteAccount(account.id)
      onClose()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not remove that')
    }
  }

  return (
    <Sheet open onClose={onClose} title={account ? 'Edit account' : 'New account'}>
      <label className="block">
        <span className="label">Name</span>
        <input
          className="field mt-1"
          value={draft.name}
          onChange={(event) => update({ name: event.target.value })}
          placeholder="BPI Savings"
          autoFocus={!account}
        />
      </label>

      <Segmented
        label="Account type"
        options={TYPES}
        value={draft.type}
        onChange={(type) => update({ type })}
      />

      <label className="block">
        <span className="label">{isCard ? 'Already owed' : 'Starting balance'}</span>
        <input
          className="field mt-1"
          type="number"
          inputMode="decimal"
          step="0.01"
          defaultValue={draft.openingBalance === 0 ? '' : formatAmount(draft.openingBalance)}
          onChange={(event) => update({ openingBalance: money(event.target.value) })}
          placeholder="0.00"
        />
        <span className="mt-1 block text-meta text-muted">
          {isCard
            ? 'What you owe on this card today.'
            : 'What is in the account before any transactions you record.'}
        </span>
      </label>

      {isCard && (
        <>
          <label className="block">
            <span className="label">Credit limit</span>
            <input
              className="field mt-1"
              type="number"
              inputMode="decimal"
              step="0.01"
              defaultValue={
                draft.creditLimit === undefined ? '' : formatAmount(draft.creditLimit)
              }
              onChange={(event) => update({ creditLimit: money(event.target.value) })}
              placeholder="60,000.00"
            />
          </label>

          <div className="flex gap-3">
            <label className="flex-1">
              <span className="label">Statement day</span>
              <input
                className="field mt-1"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                defaultValue={draft.statementDay ?? ''}
                onChange={(event) => update({ statementDay: day(event.target.value) })}
                placeholder="5"
              />
            </label>
            <label className="flex-1">
              <span className="label">Due day</span>
              <input
                className="field mt-1"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                defaultValue={draft.dueDay ?? ''}
                onChange={(event) => update({ dueDay: day(event.target.value) })}
                placeholder="25"
              />
            </label>
          </div>
        </>
      )}

      <fieldset className="border-0 p-0">
        <legend className="label">Colour</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Colour ${color}`}
              aria-pressed={draft.color === color}
              onClick={() => update({ color })}
              className={`h-9 w-9 rounded-full border-2 ${
                draft.color === color ? 'border-ink' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </fieldset>

      {problem && (
        <p role="alert" className="text-center text-meta text-negative">
          {problem}
        </p>
      )}

      <button type="button" className="btn-primary w-full" onClick={() => void onSave()}>
        {account ? 'Save changes' : 'Add account'}
      </button>

      {account && (
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={() => void setArchived(account.id, !account.archived).then(onClose)}
          >
            {account.archived ? 'Unarchive' : 'Archive'}
          </button>
          <button
            type="button"
            className="btn-secondary flex-1 !text-negative"
            onClick={() => void onDelete()}
          >
            Delete
          </button>
        </div>
      )}
    </Sheet>
  )
}
