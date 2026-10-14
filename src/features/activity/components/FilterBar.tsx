import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import type { Account, Category, Centavos, MonthKey } from '@/db/types'
import { Chip } from '@/ui/Chip'
import { Sheet } from '@/ui/Sheet'
import { formatAmount, parseMoney } from '@/lib/money'
import { categoryPath, type TxnLookups } from '@/features/transactions/describe'
import type { ActivityFilters } from '../filters'

type OpenSheet = 'month' | 'accounts' | 'categories' | 'tags' | 'amount' | null

const monthLabel = (month: MonthKey | 'all'): string =>
  month === 'all' ? 'All time' : format(parseISO(`${month}-01`), 'MMM yyyy')

interface FilterBarProps {
  filters: ActivityFilters
  onChange: (filters: ActivityFilters) => void
  months: MonthKey[]
  accounts: Account[]
  categories: Category[]
  tags: Map<string, number>
  lookups: TxnLookups
}

/** The scrolling chip row under the search box. */
export function FilterBar({
  filters,
  onChange,
  months,
  accounts,
  categories,
  tags,
  lookups,
}: FilterBarProps) {
  const [open, setOpen] = useState<OpenSheet>(null)
  const close = () => setOpen(null)

  const countLabel = (chosen: number, singular: string, all: string) =>
    chosen === 0 ? all : chosen === 1 ? singular : `${chosen} ${all.toLowerCase()}`

  const amountLabel = () => {
    const { min, max } = filters
    if (min === undefined && max === undefined) return 'Amount'
    if (min !== undefined && max !== undefined) {
      return `₱${formatAmount(min)}–${formatAmount(max)}`
    }
    return min !== undefined ? `Over ₱${formatAmount(min)}` : `Under ₱${formatAmount(max ?? 0)}`
  }

  const chosenAccount = accounts.find((a) => a.id === filters.accountIds[0])
  const chosenCategory = filters.categoryIds[0]
    ? categoryPath(filters.categoryIds[0], lookups)
    : undefined

  return (
    <>
      {/* Full-bleed so the chips can scroll past the screen padding. */}
      <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-0.5">
        <Chip active onClick={() => setOpen('month')}>
          {monthLabel(filters.month)}
        </Chip>
        <Chip active={filters.accountIds.length > 0} onClick={() => setOpen('accounts')}>
          {filters.accountIds.length === 1
            ? (chosenAccount?.name ?? 'Accounts')
            : countLabel(filters.accountIds.length, '', 'All accounts')}
        </Chip>
        <Chip active={filters.categoryIds.length > 0} onClick={() => setOpen('categories')}>
          {filters.categoryIds.length === 1
            ? (chosenCategory ?? 'Category')
            : countLabel(filters.categoryIds.length, '', 'Category')}
        </Chip>
        <Chip active={filters.tags.length > 0} onClick={() => setOpen('tags')}>
          {filters.tags.length === 1 ? `#${filters.tags[0]}` : countLabel(filters.tags.length, '', 'Tags')}
        </Chip>
        <Chip
          active={filters.min !== undefined || filters.max !== undefined}
          onClick={() => setOpen('amount')}
        >
          {amountLabel()}
        </Chip>
      </div>

      <Sheet open={open === 'month'} onClose={close} title="Month">
        <OptionList
          label="Month"
          options={[
            { id: 'all', label: 'All time' },
            ...months.map((month) => ({ id: month, label: monthLabel(month) })),
          ]}
          selected={[filters.month]}
          onToggle={(id) => {
            onChange({ ...filters, month: id as MonthKey | 'all' })
            close()
          }}
        />
      </Sheet>

      <Sheet open={open === 'accounts'} onClose={close} title="Accounts">
        <MultiSelect
          label="Accounts"
          options={accounts.map((a) => ({ id: a.id, label: a.name, color: a.color }))}
          selected={filters.accountIds}
          onChange={(accountIds) => onChange({ ...filters, accountIds })}
          emptyLabel="All accounts"
        />
      </Sheet>

      <Sheet open={open === 'categories'} onClose={close} title="Categories">
        <MultiSelect
          label="Categories"
          options={categories.map((c) => ({
            id: c.id,
            label: c.parentId ? `    ${c.name}` : c.name,
            color: c.color,
          }))}
          selected={filters.categoryIds}
          onChange={(categoryIds) => onChange({ ...filters, categoryIds })}
          emptyLabel="All categories"
        />
      </Sheet>

      <Sheet open={open === 'tags'} onClose={close} title="Tags">
        {tags.size === 0 ? (
          <p className="py-4 text-center text-meta text-muted">
            No tags yet. Add one by typing #tag in a note.
          </p>
        ) : (
          <MultiSelect
            label="Tags"
            options={[...tags.entries()].map(([tag, count]) => ({
              id: tag,
              label: `#${tag}`,
              hint: String(count),
            }))}
            selected={filters.tags}
            onChange={(selected) => onChange({ ...filters, tags: selected })}
            emptyLabel="All tags"
          />
        )}
      </Sheet>

      <Sheet open={open === 'amount'} onClose={close} title="Amount">
        <AmountRange
          min={filters.min}
          max={filters.max}
          onChange={(min, max) => {
            const next = { ...filters }
            if (min === undefined) delete next.min
            else next.min = min
            if (max === undefined) delete next.max
            else next.max = max
            onChange(next)
          }}
          onDone={close}
        />
      </Sheet>
    </>
  )
}

interface Option {
  id: string
  label: string
  color?: string
  hint?: string
}

function Row({
  option,
  checked,
  onClick,
  type,
}: {
  option: Option
  checked: boolean
  onClick: () => void
  type: 'radio' | 'checkbox'
}) {
  return (
    <button
      type="button"
      role={type}
      aria-checked={checked}
      onClick={onClick}
      className="flex min-h-touch w-full items-center gap-3 border-b border-divider px-1 py-2.5 text-left last:border-b-0"
    >
      {option.color && (
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 flex-none rounded-full"
          style={{ backgroundColor: option.color }}
        />
      )}
      <span className="min-w-0 flex-1 truncate whitespace-pre">{option.label}</span>
      {option.hint && <span className="text-meta text-muted">{option.hint}</span>}
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 flex-none items-center justify-center border ${
          type === 'radio' ? 'rounded-full' : 'rounded-md'
        } ${checked ? 'border-primary bg-primary text-primary-ink' : 'border-border-strong'}`}
      >
        {checked && (
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path d="M5 13l4 4L19 7" strokeWidth={3} />
          </svg>
        )}
      </span>
    </button>
  )
}

function OptionList({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: Option[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="max-h-[50dvh] overflow-y-auto">
      {options.map((option) => (
        <Row
          key={option.id}
          option={option}
          type="radio"
          checked={selected.includes(option.id)}
          onClick={() => onToggle(option.id)}
        />
      ))}
    </div>
  )
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  emptyLabel,
}: {
  label: string
  options: Option[]
  selected: string[]
  onChange: (selected: string[]) => void
  emptyLabel: string
}) {
  return (
    <>
      <div role="group" aria-label={label} className="max-h-[50dvh] overflow-y-auto">
        {options.map((option) => (
          <Row
            key={option.id}
            option={option}
            type="checkbox"
            checked={selected.includes(option.id)}
            onClick={() =>
              onChange(
                selected.includes(option.id)
                  ? selected.filter((id) => id !== option.id)
                  : [...selected, option.id],
              )
            }
          />
        ))}
      </div>
      {selected.length > 0 && (
        <button type="button" className="btn-secondary w-full" onClick={() => onChange([])}>
          {emptyLabel}
        </button>
      )}
    </>
  )
}

function AmountRange({
  min,
  max,
  onChange,
  onDone,
}: {
  min?: Centavos
  max?: Centavos
  onChange: (min?: Centavos, max?: Centavos) => void
  onDone: () => void
}) {
  const show = (value?: Centavos) => (value === undefined ? '' : String(value / 100))
  const read = (raw: string): Centavos | undefined =>
    raw.trim() === '' ? undefined : (parseMoney(raw) ?? undefined)

  const inverted = min !== undefined && max !== undefined && min > max

  return (
    <>
      <div className="flex items-center gap-3">
        <label className="flex-1">
          <span className="label">From</span>
          <input
            className="field mt-1"
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="0"
            value={show(min)}
            onChange={(event) => onChange(read(event.target.value), max)}
          />
        </label>
        <label className="flex-1">
          <span className="label">To</span>
          <input
            className="field mt-1"
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="Any"
            value={show(max)}
            onChange={(event) => onChange(min, read(event.target.value))}
          />
        </label>
      </div>
      {inverted && (
        <p role="alert" className="text-meta text-negative">
          The lowest amount is above the highest, so nothing can match.
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary flex-1"
          onClick={() => {
            onChange(undefined, undefined)
            onDone()
          }}
        >
          Any amount
        </button>
        <button type="button" className="btn-primary flex-1" onClick={onDone}>
          Done
        </button>
      </div>
    </>
  )
}
