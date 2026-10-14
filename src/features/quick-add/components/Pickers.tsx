import { useRef, useState } from 'react'
import type { Account, Category, Id } from '@/db/types'
import { Chip } from '@/ui/Chip'
import { CalendarIcon } from '@/ui/Icon'
import { relativeDay } from '@/lib/dates'

/** Category chips: the first six, then "More" opens the rest. */
export function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: Category[]
  value: Id | undefined
  onChange: (id: Id) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const selectedIndex = categories.findIndex((c) => c.id === value)
  // Never hide the chosen category behind "More".
  const visible =
    expanded || selectedIndex < 6 ? categories.slice(0, expanded ? undefined : 6) : [
      ...categories.slice(0, 5),
      categories[selectedIndex] as Category,
    ]

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((category) => (
        <Chip
          key={category.id}
          dot={category.color}
          active={category.id === value}
          onClick={() => onChange(category.id)}
        >
          {category.name}
        </Chip>
      ))}
      {!expanded && categories.length > 6 && (
        <Chip onClick={() => setExpanded(true)}>More</Chip>
      )}
    </div>
  )
}

function WalletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
    </svg>
  )
}

/**
 * A chip that opens the native picker. The select sits invisibly on top so
 * the control stays a real form field for keyboard and screen-reader users.
 */
export function AccountPicker({
  label,
  accounts,
  value,
  onChange,
}: {
  label: string
  accounts: Account[]
  value: Id | undefined
  onChange: (id: Id) => void
}) {
  const selected = accounts.find((a) => a.id === value)

  return (
    <span className="chip relative">
      <WalletIcon />
      {selected?.name ?? label}
      <select
        aria-label={label}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="" disabled>
          {label}
        </option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
    </span>
  )
}

/** Date chip reading "Today" / "Yesterday" / "Oct 12", backed by a date input. */
export function DatePicker({
  value,
  onChange,
  today,
}: {
  value: string
  onChange: (date: string) => void
  today: Date
}) {
  const input = useRef<HTMLInputElement>(null)

  return (
    <span className="chip relative">
      <CalendarIcon size={16} />
      {relativeDay(value, today)}
      <input
        ref={input}
        type="date"
        aria-label="Date"
        value={value}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </span>
  )
}

export function RepeatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4" />
    </svg>
  )
}

export function ReceiptIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <circle cx="12" cy="13" r="3.5" />
      <path d="M9 6l1.5-2h3L15 6" />
    </svg>
  )
}

/** Attaches a photo of a receipt. */
export function ReceiptPicker({
  attached,
  onPick,
}: {
  attached: boolean
  onPick: (file: File | null) => void
}) {
  return (
    <span className={`chip relative ${attached ? 'chip-on' : ''}`}>
      <ReceiptIcon />
      {attached ? 'Receipt added' : 'Receipt'}
      <input
        type="file"
        accept="image/*"
        aria-label="Attach a receipt"
        onChange={(event) => onPick(event.target.files?.[0] ?? null)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </span>
  )
}
