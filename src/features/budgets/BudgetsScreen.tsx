import { useMemo, useState } from 'react'
import { Screen } from '@/ui/Screen'
import { Money } from '@/ui/Money'
import { Meter } from '@/ui/Meter'
import { Ring } from '@/ui/Ring'
import { Sheet } from '@/ui/Sheet'
import { ChevronDownIcon, EditIcon } from '@/ui/Icon'
import { Badge } from '@/ui/Rows'
import { formatPercent } from '@/lib/money'
import { monthKey } from '@/lib/dates'
import type { Goal } from '@/db/types'
import { useBudgetsData } from './db'
import { buildBudgetsView, monthName, recentMonths, type BudgetRow, type GoalCard } from './budgets'
import { BudgetEditor } from './components/BudgetEditor'
import { GoalForm } from './components/GoalForm'

export function BudgetsScreen() {
  const data = useBudgetsData()
  const today = useMemo(() => new Date(), [])

  const [month, setMonth] = useState(() => monthKey(today))
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState(false)
  const [goalOpen, setGoalOpen] = useState(false)
  const [goal, setGoal] = useState<Goal | undefined>()

  const view = useMemo(
    () =>
      data
        ? buildBudgetsView(
            {
              month,
              budgets: data.budgets,
              categories: data.categories,
              transactions: data.transactions,
              goals: data.goals,
            },
            today,
          )
        : undefined,
    [data, month, today],
  )

  const editGoal = (which?: Goal) => {
    setGoal(which)
    setGoalOpen(true)
  }

  return (
    <Screen
      title={
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="mx-auto flex min-h-touch items-center gap-1.5 font-heading text-screen-sub font-semibold"
        >
          {view?.monthLabel ?? monthName(month)}
          <ChevronDownIcon size={18} />
        </button>
      }
      back
      actions={
        <button
          type="button"
          className="icon-btn"
          aria-label="Edit budgets"
          onClick={() => setEditing(true)}
        >
          <EditIcon size={20} />
        </button>
      }
    >
      {view === undefined ? (
        <div aria-hidden="true" className="h-40 animate-pulse rounded-card bg-surface" />
      ) : (
        <>
          {view.overall ? (
            <section className="card p-[18px]">
              <p className="text-meta text-muted">Total budget</p>
              <div className="my-0.5 mb-2.5 flex items-baseline justify-between gap-2">
                <p className="num text-[28px] font-bold">
                  <Money value={view.overall.spent} whole />
                  <span className="text-base font-medium text-muted">
                    {' / '}
                    <Money value={view.overall.effective} whole className="text-muted" />
                  </span>
                </p>
                <p className="num font-semibold">{formatPercent(view.overall.share)}</p>
              </div>

              <Meter
                value={view.overall.share}
                className="!h-2.5"
                {...(view.overall.status === 'over'
                  ? { color: 'rgb(var(--c-negative))' }
                  : view.overall.status === 'near'
                    ? { color: 'rgb(var(--c-warning))' }
                    : {})}
              />

              <div className="mt-2 flex justify-between gap-3">
                <p className="text-meta text-muted">
                  {view.overall.remaining >= 0 ? (
                    <>
                      <Money value={view.overall.remaining} whole className="text-muted" /> left
                    </>
                  ) : (
                    <>
                      <Money
                        value={-view.overall.remaining}
                        whole
                        tone="negative"
                        className="font-semibold"
                      />{' '}
                      over
                    </>
                  )}
                  {view.daysLeft > 0 && ` · ${view.daysLeft} days`}
                </p>
                {view.onPace !== null && view.daysLeft > 0 && (
                  <p className="text-meta text-muted">
                    On pace for <Money value={view.onPace} whole className="text-muted" />
                  </p>
                )}
              </div>
            </section>
          ) : (
            <section className="card text-center">
              <p className="font-medium">No budget for {view.monthLabel}</p>
              <p className="mt-1 text-meta text-muted">
                Set a limit for the month, for the categories that matter, or both.
              </p>
              <button
                type="button"
                className="btn-primary mt-4 w-full"
                onClick={() => setEditing(true)}
              >
                Set budgets
              </button>
            </section>
          )}

          {view.categories.length > 0 && (
            <section>
              <div className="mb-1 mt-3 flex items-center justify-between px-1">
                <h2 className="text-title font-heading font-semibold">By category</h2>
                <p className="text-meta text-muted">
                  Unbudgeted <Money value={view.unbudgeted} whole className="text-muted" />
                </p>
              </div>
              <div className="card py-1">
                {view.categories.map((row) => (
                  <BudgetLineView key={row.categoryId ?? 'overall'} row={row} />
                ))}
              </div>
            </section>
          )}

          <div className="mb-1 mt-3 flex items-center justify-between px-1">
            <h2 className="text-title font-heading font-semibold">Savings goals</h2>
            <button
              type="button"
              onClick={() => editGoal()}
              className="flex min-h-touch items-center text-sm font-medium text-primary"
            >
              Add goal
            </button>
          </div>

          {view.goals.length === 0 ? (
            <p className="px-1 text-meta text-muted">
              Nothing being saved for yet. A goal is just a target and what you have put
              aside.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {view.goals.map((card) => (
                <GoalTile key={card.goal.id} card={card} onEdit={() => editGoal(card.goal)} />
              ))}
            </div>
          )}
        </>
      )}

      <Sheet open={picking} onClose={() => setPicking(false)} title="Pick a month">
        <div className="grid grid-cols-2 gap-2">
          {recentMonths(today).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={key === month}
              onClick={() => {
                setMonth(key)
                setPicking(false)
              }}
              className={`min-h-[48px] rounded-ctl border text-sm font-medium ${
                key === month
                  ? 'border-contrast bg-contrast text-contrast-ink'
                  : 'border-border-strong bg-surface text-ink'
              }`}
            >
              {monthName(key)}
            </button>
          ))}
        </div>
      </Sheet>

      <BudgetEditor
        open={editing}
        onClose={() => setEditing(false)}
        month={month}
        budgets={data?.budgets ?? []}
        categories={data?.categories ?? []}
      />

      <GoalForm
        open={goalOpen}
        onClose={() => setGoalOpen(false)}
        {...(goal ? { goal } : {})}
      />
    </Screen>
  )
}

function BudgetLineView({ row }: { row: BudgetRow }) {
  return (
    <div className="border-b border-divider py-3.5 last:border-b-0">
      <div className="mb-2 flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 flex-none rounded-full"
          style={{ backgroundColor: row.color }}
        />
        <p className="flex-1 truncate font-medium">{row.name}</p>

        {row.status === 'over' ? (
          <Badge tone="negative">
            Over by <Money value={-row.remaining} compact tone="negative" />
          </Badge>
        ) : row.status === 'near' ? (
          <Badge tone="warning">{formatPercent(row.share)} · near limit</Badge>
        ) : row.carry > 0 ? (
          <Badge>
            Rollover <Money value={row.carry} compact signed className="text-muted" />
          </Badge>
        ) : (
          <p className="flex-none text-meta text-muted">{formatPercent(row.share)}</p>
        )}
      </div>

      <Meter
        value={row.share}
        {...(row.status === 'over'
          ? { color: 'rgb(var(--c-negative))' }
          : row.status === 'near'
            ? { color: 'rgb(var(--c-warning))' }
            : {})}
      />

      <p className="mt-1.5 text-meta text-muted">
        <Money value={row.spent} compact className="text-ink" /> of{' '}
        <Money value={row.effective} compact className="text-muted" />
        {row.carryNote && (
          <>
            {' ('}
            <Money value={row.limit} compact className="text-muted" />
            {' + '}
            <Money value={row.carry} compact className="text-muted" /> {row.carryNote})
          </>
        )}
      </p>
    </div>
  )
}

function GoalTile({ card, onEdit }: { card: GoalCard; onEdit: () => void }) {
  const { goal } = card

  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Edit ${goal.name}`}
      className="card p-3.5 text-left"
    >
      <div className="mb-2 flex items-start justify-between">
        <Ring value={card.share} />
        <EditIcon size={16} aria-hidden="true" className="text-muted" />
      </div>
      <p className="truncate font-semibold">{goal.name}</p>
      <p className="num my-0.5 text-sm">
        <Money value={goal.saved} whole /> / <Money value={goal.target} whole />
      </p>
      <p className="text-meta text-muted">
        {card.perMonth !== undefined ? (
          <>
            <Money value={card.perMonth} whole className="text-muted" />
            /mo {card.note}
          </>
        ) : (
          card.note
        )}
      </p>
    </button>
  )
}
