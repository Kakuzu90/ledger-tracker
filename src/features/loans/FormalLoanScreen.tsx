import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Screen } from '@/ui/Screen'
import { Money } from '@/ui/Money'
import { Meter } from '@/ui/Meter'
import { EditIcon } from '@/ui/Icon'
import { useUIStore } from '@/store/ui'
import { formatPercent } from '@/lib/money'
import { toDateOnly } from '@/lib/dates'
import { deletePayment, recordPayment, useFormalLoan } from './db'
import {
  buildFormalView,
  EXTRA_MAX,
  EXTRA_STEP,
  scheduleWindow,
  simulate,
  type FormalView,
  type ScheduleRow,
} from './formal'
import { FormalLoanForm } from './components/FormalLoanForm'

export function FormalLoanScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const showSnack = useUIStore((s) => s.showSnack)
  const today = toDateOnly(new Date())

  const data = useFormalLoan(id)
  const view = useMemo(
    () =>
      data?.loan
        ? buildFormalView(
            { loan: data.loan, payments: data.payments, accounts: data.accounts },
            today,
          )
        : undefined,
    [data, today],
  )

  const [extra, setExtra] = useState(0)
  const [fullTable, setFullTable] = useState(false)
  const [editing, setEditing] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [logging, setLogging] = useState(false)

  // The loan was deleted from the edit sheet, or never existed.
  useEffect(() => {
    if (data && data.loan === null) navigate('/loans', { replace: true })
  }, [data, navigate])

  if (!data?.loan || !view) {
    return (
      <Screen title="Loan" back>
        <div aria-hidden="true" className="h-56 animate-pulse rounded-card bg-surface" />
      </Screen>
    )
  }

  const { loan } = view

  const onLog = async () => {
    if (!loan.accountId || !view.nextDue) {
      setProblem('Choose an account for this loan first')
      return
    }

    setLogging(true)
    try {
      const paymentId = await recordPayment({
        loanId: loan.id,
        amount: view.monthly,
        date: view.nextDue,
        accountId: loan.accountId,
        installmentNo: view.nextNumber,
      })
      showSnack({
        message: `Payment ${view.nextNumber} logged`,
        actionLabel: 'Undo',
        onAction: () => deletePayment(paymentId),
      })
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not log that')
    } finally {
      setLogging(false)
    }
  }

  return (
    <Screen
      title={loan.note || 'Loan'}
      back
      actions={
        <button
          type="button"
          className="icon-btn"
          aria-label="Edit loan"
          onClick={() => setEditing(true)}
        >
          <EditIcon size={20} />
        </button>
      }
    >
      <Summary view={view} onLog={() => void onLog()} logging={logging} />

      {problem && (
        <p role="alert" className="text-center text-meta text-negative">
          {problem}
        </p>
      )}

      {view.amortises && !view.settled && (
        <Simulator view={view} extra={extra} onExtra={setExtra} />
      )}

      {view.amortises && (
        <section className="card px-4 py-3">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-title font-heading font-semibold">Schedule</h2>
            <button
              type="button"
              onClick={() => setFullTable((shown) => !shown)}
              aria-expanded={fullTable}
              className="flex min-h-touch items-center text-sm font-medium text-primary"
            >
              {fullTable ? 'Show less' : 'Full table'}
            </button>
          </div>
          <ScheduleTable
            rows={fullTable ? view.schedule : scheduleWindow(view.schedule)}
            scroll={fullTable}
          />
        </section>
      )}

      <FormalLoanForm
        open={editing}
        onClose={() => setEditing(false)}
        loan={loan}
        accounts={data.accounts}
      />
    </Screen>
  )
}

function Summary({
  view,
  onLog,
  logging,
}: {
  view: FormalView
  onLog: () => void
  logging: boolean
}) {
  return (
    <section className="card">
      <p className="text-meta text-muted">
        {view.terms === '' ? 'Formal loan' : view.terms} ·{' '}
        <Money value={view.loan.principal} whole className="text-muted" />
      </p>

      <Money value={view.remaining} whole className="mb-0.5 mt-2 block text-[34px] font-bold" />
      <p className="mb-3 text-meta text-muted">
        {view.settled ? 'paid off' : 'remaining principal'}
      </p>

      {view.amortises && (
        <>
          <Meter value={view.share} />
          <div className="mt-1.5 flex justify-between">
            <p className="text-meta text-muted">{formatPercent(view.share)} paid off</p>
            <p className="text-meta text-muted">
              {view.paidCount} of {view.termMonths} payments
            </p>
          </div>

          <div className="mt-3.5 grid grid-cols-2 gap-2">
            <Stat label="Monthly payment" value={<Money value={view.monthly} whole />} />
            <Stat
              label="Next due"
              value={view.nextDue ? format(parseISO(view.nextDue), 'MMM d') : '—'}
              tone={view.overdue ? 'negative' : 'plain'}
            />
            <Stat label="Interest paid" value={<Money value={view.interestPaid} whole />} />
            <Stat
              label="Payoff date"
              value={view.payoffDate ? format(parseISO(view.payoffDate), 'MMM yyyy') : '—'}
            />
          </div>
        </>
      )}

      {view.settled ? (
        <p className="mt-3.5 rounded-ctl bg-primary-soft p-3 text-center text-meta font-medium text-primary">
          This loan is paid off.
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={onLog}
            disabled={logging || view.monthly <= 0}
            className="btn-primary mt-3.5 min-h-[50px] w-full disabled:opacity-50"
          >
            Log {view.nextLabel ?? 'the next'} payment ·
            <Money value={view.monthly} whole className="!text-primary-ink" />
          </button>
          <p className="mt-2 text-center text-meta text-muted">
            {view.accountName
              ? `Also adds an expense to ${view.accountName}`
              : 'Set an account on this loan so the payment posts somewhere'}
          </p>
        </>
      )}
    </section>
  )
}

function Stat({
  label,
  value,
  tone = 'plain',
}: {
  label: string
  value: ReactNode
  tone?: 'plain' | 'negative'
}) {
  return (
    <div className="rounded-ctl bg-bg p-3">
      <p className="text-meta text-muted">{label}</p>
      <p className={`num font-semibold ${tone === 'negative' ? 'text-negative' : ''}`}>
        {value}
      </p>
    </div>
  )
}

function Simulator({
  view,
  extra,
  onExtra,
}: {
  view: FormalView
  extra: number
  onExtra: (value: number) => void
}) {
  const result = useMemo(() => simulate(view, extra), [view, extra])

  return (
    <section className="rounded-card border border-primary/30 bg-primary-soft p-4">
      <h2 className="text-title font-heading font-semibold">What if I pay extra?</h2>

      <label htmlFor="extra" className="mt-2.5 block text-meta text-muted">
        Extra per month
      </label>
      <div className="flex items-center gap-3">
        <input
          id="extra"
          type="range"
          min={0}
          max={EXTRA_MAX}
          step={EXTRA_STEP}
          value={extra}
          onChange={(event) => onExtra(Number(event.target.value))}
          className="min-h-touch flex-1 accent-primary"
        />
        <Money value={extra} whole className="min-w-[72px] text-right text-lg font-bold" />
      </div>

      {extra === 0 ? (
        <p className="mt-1.5 text-meta text-muted">
          Drag to see what an extra payment each month would do. As it stands the loan runs{' '}
          {result.basePayments} more {result.basePayments === 1 ? 'month' : 'months'}.
        </p>
      ) : (
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <div className="rounded-ctl bg-surface p-3">
            <p className="text-meta text-muted">Finish</p>
            <p className="num text-lg font-bold text-primary">
              {result.monthsSaved === 0
                ? 'No sooner'
                : `${result.monthsSaved} ${result.monthsSaved === 1 ? 'month' : 'months'} sooner`}
            </p>
            <p className="text-meta text-muted">
              {result.payoffDate ? format(parseISO(result.payoffDate), 'MMM yyyy') : '—'}
            </p>
          </div>
          <div className="rounded-ctl bg-surface p-3">
            <p className="text-meta text-muted">Interest saved</p>
            <p className="num text-lg font-bold text-primary">
              ≈ <Money value={result.interestSaved} whole tone="positive" />
            </p>
            <p className="text-meta text-muted">over the loan</p>
          </div>
        </div>
      )}
    </section>
  )
}

function ScheduleTable({ rows, scroll }: { rows: readonly ScheduleRow[]; scroll: boolean }) {
  return (
    <div className={`overflow-x-auto ${scroll ? 'max-h-[420px] overflow-y-auto' : ''}`}>
      <table className="w-full border-collapse text-right text-sm">
        <thead>
          <tr>
            <Th className="text-left">#</Th>
            <Th>Principal</Th>
            <Th>Interest</Th>
            <Th>Balance</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.n}
              className={
                row.status === 'due'
                  ? 'bg-primary-soft font-semibold'
                  : row.status === 'paid'
                    ? 'text-muted'
                    : ''
              }
            >
              <Td className="text-left">
                {row.status === 'paid' && <span aria-label="Paid">✓ </span>}
                {row.n} · {row.label}
              </Td>
              <Td>
                <Money value={row.principal} whole />
              </Td>
              <Td>
                <Money value={row.interest} whole />
              </Td>
              <Td>
                <Money value={row.balance} whole />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const Th = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <th
    scope="col"
    // Sticky so the columns stay labelled while the full 60-row table scrolls.
    className={`sticky top-0 border-b border-border bg-surface px-1 py-2 text-label text-muted ${className}`}
  >
    {children}
  </th>
)

const Td = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <td className={`num border-b border-divider px-1 py-2.5 ${className}`}>{children}</td>
)
