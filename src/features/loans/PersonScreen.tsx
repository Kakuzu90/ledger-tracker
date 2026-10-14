import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Screen } from '@/ui/Screen'
import { Money } from '@/ui/Money'
import { Meter } from '@/ui/Meter'
import { CheckIcon, ShareIcon } from '@/ui/Icon'
import { useUIStore } from '@/store/ui'
import { toDateOnly } from '@/lib/dates'
import type { Id } from '@/db/types'
import { reopenLoans, settleLoans, usePersonData } from './db'
import { buildPersonView, type HistoryEntry, type LoanCard } from './person'
import { PaymentSheet } from './components/PaymentSheet'

export function PersonScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const showSnack = useUIStore((s) => s.showSnack)
  const today = toDateOnly(new Date())

  const data = usePersonData(id)
  const view = useMemo(
    () =>
      data?.contact
        ? buildPersonView(
            {
              contact: data.contact,
              loans: data.loans,
              payments: data.payments,
              accounts: data.accounts,
            },
            today,
          )
        : undefined,
    [data, today],
  )

  const [paying, setPaying] = useState<{ loanId?: Id } | null>(null)
  const [reminding, setReminding] = useState(false)
  const [showSettled, setShowSettled] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  // The contact was removed from under us; the list is the right place to land.
  useEffect(() => {
    if (data && data.contact === null) navigate('/loans', { replace: true })
  }, [data, navigate])

  if (!data || !view) {
    return (
      <Screen title="Person" back>
        <div aria-hidden="true" className="h-44 animate-pulse rounded-card bg-surface" />
      </Screen>
    )
  }

  const onSettle = async () => {
    const closed = await settleLoans(view.open.map((row) => row.loan.id))
    if (closed.length === 0) return
    showSnack({
      message: `Marked ${closed.length} ${closed.length === 1 ? 'loan' : 'loans'} settled`,
      actionLabel: 'Undo',
      onAction: () => reopenLoans(closed),
    })
  }

  const onShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text: view.reminder })
        return
      }
      await navigator.clipboard.writeText(view.reminder)
      showSnack({ message: 'Reminder copied' })
    } catch (error) {
      // A cancelled share sheet is not a failure worth shouting about.
      if (error instanceof DOMException && error.name === 'AbortError') return
      setProblem('Could not share that — copy the text instead')
    }
  }

  return (
    <Screen title={view.contact.name} back>
      <section className="pb-0.5 pt-1.5 text-center">
        <p className="text-meta text-muted">{view.headline}</p>
        <Money
          value={Math.abs(view.net)}
          tone={view.net > 0 ? 'positive' : view.net < 0 ? 'negative' : 'plain'}
          whole
          className="my-0.5 block text-[40px] font-bold"
        />
        <p className="text-meta text-muted">
          {view.openCount} open {view.openCount === 1 ? 'loan' : 'loans'}
          {view.lent > 0 && (
            <>
              {' · lent '}
              <Money value={view.lent} whole className="text-muted" />
            </>
          )}
          {view.borrowed > 0 && (
            <>
              {' · borrowed '}
              <Money value={view.borrowed} whole className="text-muted" />
            </>
          )}
          {view.repaid > 0 && (
            <>
              {' · repaid '}
              <Money value={view.repaid} whole className="text-muted" />
            </>
          )}
        </p>
      </section>

      {view.open.length > 0 && (
        <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
          <button type="button" className="btn-primary !px-2" onClick={() => setPaying({})}>
            Record payment
          </button>
          <button
            type="button"
            className="btn-secondary !px-2 disabled:opacity-50"
            disabled={!view.canRemind}
            onClick={() => setReminding((on) => !on)}
            aria-expanded={reminding}
          >
            <ShareIcon />
            Remind
          </button>
          <button
            type="button"
            className="btn-secondary !px-2"
            onClick={() => void onSettle()}
          >
            <CheckIcon />
            Settle
          </button>
        </div>
      )}

      {view.open.map((row) => (
        <LoanCardView key={row.loan.id} row={row} onPay={() => setPaying({ loanId: row.loan.id })} />
      ))}

      {reminding && view.reminder !== '' && (
        <section className="rounded-card border border-primary/30 bg-primary-soft p-4">
          <p className="mb-1.5 text-meta font-semibold text-primary">Reminder message</p>
          <p className="m-0 text-sm">{view.reminder}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn-primary flex-1" onClick={() => void onShare()}>
              Share via…
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void navigator.clipboard
                .writeText(view.reminder)
                .then(() => showSnack({ message: 'Reminder copied' }))}
            >
              Copy
            </button>
          </div>
        </section>
      )}

      {problem && (
        <p role="alert" className="text-center text-meta text-negative">
          {problem}
        </p>
      )}

      {view.open.length === 0 && (
        <section className="card text-center">
          <p className="font-medium">Nothing outstanding</p>
          <p className="mt-1 text-meta text-muted">
            Every loan with {view.contact.name} is settled.
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-1 mt-1 px-1 text-title font-heading font-semibold">History</h2>
        {view.history.length === 0 ? (
          <p className="px-1 text-meta text-muted">Nothing recorded yet.</p>
        ) : (
          <div className="px-1">
            {view.history.map((entry) => (
              <HistoryRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </section>

      {view.settled.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowSettled((shown) => !shown)}
            aria-expanded={showSettled}
            className="flex min-h-[48px] items-center justify-between px-1 text-sm text-muted"
          >
            {view.settled.length} settled {view.settled.length === 1 ? 'loan' : 'loans'}
            <span className="text-muted">{showSettled ? 'Hide' : 'Show'}</span>
          </button>

          {showSettled &&
            view.settled.map((row) => <LoanCardView key={row.loan.id} row={row} />)}
        </>
      )}

      <PaymentSheet
        open={paying !== null}
        onClose={() => setPaying(null)}
        loans={view.open}
        accounts={data.accounts}
        {...(paying?.loanId ? { loanId: paying.loanId } : {})}
      />
    </Screen>
  )
}

const BADGE: Readonly<Record<LoanCard['badge']['tone'], string>> = {
  overdue: 'bg-negative/15 text-negative',
  open: 'bg-divider text-muted',
  settled: 'bg-primary/15 text-primary',
}

function LoanCardView({ row, onPay }: { row: LoanCard; onPay?: () => void }) {
  const overdue = row.badge.tone === 'overdue'

  return (
    <section className={`card ${overdue ? '!border-negative/35' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{row.loan.note || 'Loan'}</p>
          <p className="text-meta text-muted">{row.subtitle}</p>
        </div>
        <span
          className={`inline-flex min-h-[22px] flex-none items-center rounded-full px-2 text-[12px] font-semibold ${BADGE[row.badge.tone]}`}
        >
          {row.badge.text}
        </span>
      </div>

      <div className="mb-1.5 mt-3 flex justify-between gap-2">
        <p className="text-meta text-muted">
          <Money value={row.repaid} compact className="text-ink" /> of{' '}
          <Money value={row.loan.principal} compact className="text-muted" /> repaid
        </p>
        <p className="text-meta text-muted">
          <Money value={row.outstanding} compact className="font-semibold text-ink" /> left
        </p>
      </div>
      <Meter value={row.share} />

      {onPay && (
        <button type="button" className="btn-secondary mt-3 w-full" onClick={onPay}>
          Record a payment
        </button>
      )}
    </section>
  )
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  return (
    <div className="flex gap-3 py-2.5">
      <span
        aria-hidden="true"
        className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${
          entry.kind === 'payment' ? 'bg-primary' : 'bg-negative'
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{entry.title}</p>
        <p className="truncate text-meta text-muted">{entry.subtitle}</p>
      </div>
      <Money
        value={entry.amount}
        tone={entry.tone}
        signed={entry.kind === 'payment' && entry.amount > 0}
        compact
        className="flex-none font-semibold"
      />
    </div>
  )
}
