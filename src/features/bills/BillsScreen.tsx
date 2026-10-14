import { useEffect, useMemo, useState } from 'react'
import { Screen } from '@/ui/Screen'
import { Money } from '@/ui/Money'
import { BellIcon, ChevronRightIcon, PlusIcon } from '@/ui/Icon'
import { useUIStore } from '@/store/ui'
import { getSetting, setSetting } from '@/db/settings'
import { askForNotifications, notificationState } from '@/lib/notifications'
import { confirmPending, restorePending, skipPending } from '@/features/transactions/db'
import type { Recurring } from '@/db/types'
import { Badge } from '@/ui/Rows'
import { useBillsData } from './db'
import { buildBillsView, type BillRow, type RuleRow } from './bills'
import { RuleForm } from './components/RuleForm'

/** Set once the user has answered the reminders banner, either way. */
const BANNER_KEY = 'billRemindersAsked'

export function BillsScreen() {
  const data = useBillsData()
  const showSnack = useUIStore((s) => s.showSnack)
  const today = useMemo(() => new Date(), [])

  const view = useMemo(
    () => (data ? buildBillsView(data, today) : undefined),
    [data, today],
  )

  const [editing, setEditing] = useState<Recurring | undefined>()
  const [formOpen, setFormOpen] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [banner, setBanner] = useState(false)

  // Only worth asking once, and only while the browser can still be asked.
  useEffect(() => {
    void (async () => {
      const asked = await getSetting(BANNER_KEY, false)
      setBanner(!asked && notificationState() === 'default')
    })()
  }, [])

  const answerBanner = async (turnOn: boolean) => {
    setBanner(false)
    await setSetting(BANNER_KEY, true)
    if (!turnOn) return

    const state = await askForNotifications()
    await setSetting('billReminders', state === 'granted')
    showSnack({
      message:
        state === 'granted'
          ? 'Reminders on — you will see them when you open Ledger'
          : 'Reminders stay off',
    })
  }

  // Same confirmations the Activity screen gives for the same two actions.
  const onConfirm = async (id: string) => {
    await confirmPending(id)
    showSnack({ message: 'Added to your ledger' })
  }

  const onSkip = async (id: string) => {
    const skipped = await skipPending(id)
    showSnack({
      message: 'Skipped this one',
      actionLabel: 'Undo',
      onAction: () => restorePending(skipped),
    })
  }

  const edit = (rule: Recurring) => {
    setEditing(rule)
    setFormOpen(true)
  }

  const add = () => {
    setEditing(undefined)
    setFormOpen(true)
  }

  return (
    <Screen
      title="Bills & recurring"
      back
      actions={
        <button type="button" className="icon-btn" aria-label="New recurring" onClick={add}>
          <PlusIcon size={20} />
        </button>
      }
    >
      {view === undefined ? (
        <div aria-hidden="true" className="h-40 animate-pulse rounded-card bg-surface" />
      ) : (
        <>
          {banner && (
            <section className="flex items-start gap-3 rounded-card bg-contrast p-4 text-contrast-ink">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 flex-none items-center justify-center rounded-ctl bg-contrast-ink/15"
              >
                <BellIcon size={20} />
              </span>
              <div className="flex-1">
                <p className="font-semibold">Get reminded before bills are due</p>
                <p className="mb-2.5 mt-0.5 text-meta opacity-80">
                  Ledger has no server, so it flags anything due in the next day when you
                  open it.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void answerBanner(true)}
                    className="min-h-touch rounded-ctl bg-surface px-4 text-sm font-semibold text-ink"
                  >
                    Turn on
                  </button>
                  <button
                    type="button"
                    onClick={() => void answerBanner(false)}
                    className="min-h-touch px-3 text-sm font-medium opacity-80"
                  >
                    Not now
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="grid grid-cols-2 gap-2.5">
            <div className="rounded-[16px] border border-border bg-surface p-3.5">
              <p className="text-meta text-muted">Next 30 days</p>
              <Money
                value={view.next30.total}
                whole
                className="mt-0.5 block text-[22px] font-bold"
              />
              <p className="text-meta text-muted">
                {view.next30.count} {view.next30.count === 1 ? 'payment' : 'payments'}
              </p>
            </div>
            <div className="rounded-[16px] border border-border bg-surface p-3.5">
              <p className="text-meta text-muted">Subscriptions</p>
              <p className="mt-0.5 text-[22px] font-bold">
                <Money value={view.subscriptions.monthly} whole className="text-[22px]" />
                <span className="text-meta font-medium text-muted">/mo</span>
              </p>
              <p className="text-meta text-muted">
                <Money value={view.subscriptions.yearly} whole className="text-muted" /> a year
              </p>
            </div>
          </section>

          {view.thisWeek.length > 0 && (
            <section>
              <h2 className="label mb-1.5 mt-2 px-1">This week</h2>
              <div className="card py-1">
                {view.thisWeek.map((row) => (
                  <BillLine
                    key={row.key}
                    row={row}
                    onEdit={edit}
                    onConfirm={() => void onConfirm(row.pending?.id ?? '')}
                    onSkip={() => void onSkip(row.pending?.id ?? '')}
                  />
                ))}
              </div>
            </section>
          )}

          {view.later.length > 0 && (
            <section>
              <h2 className="label mb-1.5 mt-2 px-1">Later</h2>
              <div className="card py-1">
                {view.later.map((row) => (
                  <BillLine key={row.key} row={row} onEdit={edit} />
                ))}
              </div>
            </section>
          )}

          {view.rules.length === 0 && (
            <section className="card text-center">
              <p className="font-medium">Nothing recurring yet</p>
              <p className="mt-1 text-meta text-muted">
                Add the bills and subscriptions that come round every month and Ledger will
                keep track of them.
              </p>
              <button type="button" className="btn-primary mt-4 w-full" onClick={add}>
                Add a recurring bill
              </button>
            </section>
          )}

          {view.rules.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowRules((shown) => !shown)}
                aria-expanded={showRules}
                className="flex min-h-[52px] items-center justify-between px-1 text-sm text-muted"
              >
                Manage all {view.rules.length} recurring{' '}
                {view.rules.length === 1 ? 'rule' : 'rules'}
                <ChevronRightIcon
                  size={18}
                  className={showRules ? 'rotate-90 transition-transform' : 'transition-transform'}
                />
              </button>

              {showRules && (
                <div className="card py-1">
                  {view.rules.map((row) => (
                    <RuleLine key={row.rule.id} row={row} onEdit={edit} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      <RuleForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        {...(editing ? { rule: editing } : {})}
        accounts={data?.accounts ?? []}
        categories={data?.categories ?? []}
      />
    </Screen>
  )
}

function BillLine({
  row,
  onEdit,
  onConfirm,
  onSkip,
}: {
  row: BillRow
  onEdit: (rule: Recurring) => void
  onConfirm?: () => void
  onSkip?: () => void
}) {
  const waiting = row.pending !== undefined

  const body = (
    <>
      <span
        aria-hidden="true"
        className={`flex h-11 w-11 flex-none flex-col items-center justify-center rounded-ctl border bg-bg leading-[1.1] ${
          row.due ? 'border-primary' : 'border-border'
        }`}
      >
        <span className="text-label text-muted">{row.month}</span>
        <span className="num text-base font-bold">{row.day}</span>
      </span>

      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-medium">{row.title}</span>
        <span className="flex items-center gap-1.5 text-meta text-muted">
          <span className="truncate">
            {row.subtitle}
            {row.lastAmount !== undefined && (
              <>
                {' · last '}
                <Money value={row.lastAmount} compact className="text-muted" />
              </>
            )}
          </span>
          <Badge tone={row.mode === 'auto' ? 'positive' : 'neutral'}>
            {row.mode === 'auto' ? 'Auto' : 'Ask first'}
          </Badge>
        </span>
      </span>

      <span className="num flex-none font-semibold">
        {row.estimated && '~'}
        <Money value={row.amount} whole={row.estimated} compact />
      </span>
    </>
  )

  return (
    <div className="border-b border-divider py-2.5 last:border-b-0">
      {/*
        The whole line is the edit control, as in RuleLine below. It used to
        be the amount text alone — a small target with no affordance — and
        `disabled:opacity-100` hid the fact that a line without a rule
        behind it does nothing at all.
      */}
      {row.rule ? (
        <button
          type="button"
          onClick={() => row.rule && onEdit(row.rule)}
          aria-label={`Edit ${row.title}`}
          className="flex w-full items-center gap-3"
        >
          {body}
        </button>
      ) : (
        <div className="flex w-full items-center gap-3">{body}</div>
      )}

      {waiting && onConfirm && onSkip && (
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="min-h-touch px-2.5 text-sm font-medium text-muted"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-touch rounded-ctl bg-primary px-3.5 text-sm font-semibold text-primary-ink"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  )
}

function RuleLine({ row, onEdit }: { row: RuleRow; onEdit: (rule: Recurring) => void }) {
  return (
    <button
      type="button"
      onClick={() => onEdit(row.rule)}
      className={`list-row w-full text-left ${row.ended ? 'opacity-60' : ''}`}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium">{row.title}</span>
          {row.subscription && <Badge>Sub</Badge>}
        </span>
        <span className="block truncate text-meta text-muted">{row.subtitle}</span>
      </span>
      <Badge tone={row.rule.mode === 'auto' ? 'positive' : 'neutral'}>
        {row.rule.mode === 'auto' ? 'Auto' : 'Ask first'}
      </Badge>
      <Money value={row.amount} compact className="flex-none font-semibold" />
    </button>
  )
}
