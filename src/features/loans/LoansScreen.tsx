import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '@/ui/Screen'
import { Money } from '@/ui/Money'
import { Meter } from '@/ui/Meter'
import { CategoryTile } from '@/ui/CategoryTile'
import { ChevronRightIcon, PlusIcon } from '@/ui/Icon'
import { toDateOnly } from '@/lib/dates'
import { useLoansData } from './db'
import { buildLoansView, FILTERS, type LoanFilter, type FormalRow, type PersonRow } from './loans'
import { Avatar } from './components/Avatar'

export function LoansScreen() {
  const data = useLoansData()
  const [filter, setFilter] = useState<LoanFilter>('all')
  const today = toDateOnly(new Date())

  const view = useMemo(
    () => (data ? buildLoansView(data, today, filter) : undefined),
    [data, today, filter],
  )

  return (
    <Screen
      title="Loans"
      actions={
        <Link
          to="/loans/new"
          className="flex min-h-touch items-center gap-1.5 rounded-ctl bg-contrast px-3.5 text-sm font-semibold text-contrast-ink no-underline"
        >
          <PlusIcon size={18} />
          New loan
        </Link>
      }
    >
      {view === undefined ? (
        <div aria-hidden="true" className="h-40 animate-pulse rounded-card bg-surface" />
      ) : (
        <>
          <section className="card">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-meta text-muted">Owed to you</p>
                <Money
                  value={view.totals.owedToYou}
                  tone="positive"
                  whole
                  className="mt-0.5 block text-2xl font-bold"
                />
              </div>
              <div>
                <p className="text-meta text-muted">You owe</p>
                <Money
                  value={view.totals.youOwe}
                  tone="negative"
                  whole
                  className="mt-0.5 block text-2xl font-bold"
                />
              </div>
            </div>

            <Balance owedToYou={view.totals.owedToYou} youOwe={view.totals.youOwe} />

            <p className="text-meta text-muted">
              {view.totals.net === 0 ? (
                'Everything balances out'
              ) : (
                <>
                  Net{' '}
                  <Money
                    value={Math.abs(view.totals.net)}
                    signed={view.totals.net > 0}
                    whole
                    className="font-semibold"
                  />{' '}
                  {view.totals.net > 0 ? 'in your favor' : 'against you'}
                </>
              )}
            </p>
          </section>

          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5">
            {FILTERS.map((chip) => {
              const count =
                chip.value === 'overdue'
                  ? view.overdueCount
                  : chip.value === 'settled'
                    ? view.settledCount
                    : 0
              if (count === 0 && (chip.value === 'overdue' || chip.value === 'settled')) {
                return null
              }
              return (
                <button
                  key={chip.value}
                  type="button"
                  aria-pressed={filter === chip.value}
                  onClick={() => setFilter(chip.value)}
                  className={`chip ${filter === chip.value ? 'chip-on' : ''}`}
                >
                  {count > 0 ? `${chip.label} · ${count}` : chip.label}
                </button>
              )
            })}
          </div>

          {view.people.length > 0 && (
            <section>
              <div className="mb-1 mt-2 flex items-center justify-between px-1">
                <h2 className="text-title font-heading font-semibold">People</h2>
                <p className="text-meta text-muted">
                  {filter === 'settled'
                    ? `${view.people.length} settled`
                    : `${view.openPersonalCount} open`}
                </p>
              </div>
              <div className="card py-1">
                {view.people.map((person) => (
                  <PersonLink key={person.contact.id} person={person} />
                ))}
              </div>
            </section>
          )}

          {view.formal.length > 0 && (
            <section>
              <div className="mb-1 mt-2 flex items-center justify-between px-1">
                <h2 className="text-title font-heading font-semibold">Formal loans</h2>
                <p className="text-meta text-muted">
                  {view.formal.length} {filter === 'settled' ? 'settled' : 'active'}
                </p>
              </div>
              <div className="card py-1">
                {view.formal.map((row) => (
                  <FormalLink key={row.loan.id} row={row} />
                ))}
              </div>
            </section>
          )}

          {view.people.length === 0 && view.formal.length === 0 && (
            <section className="card text-center">
              <p className="font-medium">
                {filter === 'all' ? 'No loans yet' : 'Nothing under this filter'}
              </p>
              <p className="mt-1 text-meta text-muted">
                {filter === 'all'
                  ? 'Track what you have lent out, what you owe, and anything on instalment.'
                  : 'Try another chip above.'}
              </p>
              {filter === 'all' && (
                <Link to="/loans/new" className="btn-primary mt-4 w-full">
                  Add a loan
                </Link>
              )}
            </section>
          )}

          {filter !== 'settled' && view.settledCount > 0 && (
            <button
              type="button"
              onClick={() => setFilter('settled')}
              className="flex min-h-[52px] items-center justify-between px-1 text-sm text-muted"
            >
              Settled history · {view.settledCount}{' '}
              {view.settledCount === 1 ? 'loan' : 'loans'}
              <ChevronRightIcon size={18} />
            </button>
          )}
        </>
      )}
    </Screen>
  )
}

/** The two-tone bar under the totals, weighted by each side. */
function Balance({ owedToYou, youOwe }: { owedToYou: number; youOwe: number }) {
  if (owedToYou === 0 && youOwe === 0) return <div className="my-3.5" />

  return (
    <div aria-hidden="true" className="my-3.5 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
      <span style={{ flex: owedToYou }} className="bg-primary" />
      <span style={{ flex: youOwe }} className="bg-negative" />
    </div>
  )
}

function PersonLink({ person }: { person: PersonRow }) {
  const { contact, net, subtitle, overdueDays } = person

  return (
    <Link to={`/loans/person/${contact.id}`} className="list-row no-underline">
      <Avatar name={contact.name} tone={net < 0 ? 'negative' : 'positive'} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{contact.name}</span>
        <span className="flex items-center gap-1.5 text-meta text-muted">
          <span className="truncate">{subtitle}</span>
          {overdueDays > 0 && (
            <span className="inline-flex min-h-[20px] flex-none items-center rounded-full bg-negative/15 px-2 text-[11px] font-semibold text-negative">
              Overdue {overdueDays}d
            </span>
          )}
        </span>
      </span>
      <span className="flex-none text-right">
        <Money
          value={net}
          tone="auto"
          signed={net > 0}
          whole
          className="block font-semibold"
        />
        <span className="block text-meta text-muted">
          {net >= 0 ? 'owes you' : 'you owe'}
        </span>
      </span>
    </Link>
  )
}

function FormalLink({ row }: { row: FormalRow }) {
  // Interest-bearing loans read blue, 0% instalment plans pink, as in the mockup.
  const color = (row.loan.ratePct ?? 0) > 0 ? '#1D4E89' : '#8A2452'

  return (
    <Link to={`/loans/formal/${row.loan.id}`} className="list-row items-start no-underline">
      <CategoryTile color={color} name={row.loan.note} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{row.title}</span>
        <span className="block text-meta text-muted">{row.subtitle}</span>
        <Meter value={row.share} color={color} className="mt-1.5 !h-1.5" />
      </span>
      <span className="flex-none text-right">
        <Money value={row.remaining} whole className="block font-semibold" />
        <span className="block text-meta text-muted">left</span>
      </span>
    </Link>
  )
}
