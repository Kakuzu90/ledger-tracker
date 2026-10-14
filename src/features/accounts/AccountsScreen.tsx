import { useState } from 'react'
import { Screen } from '@/ui/Screen'
import { Money } from '@/ui/Money'
import { Meter } from '@/ui/Meter'
import { ChevronRightIcon, EditIcon, LoansIcon, PlusIcon } from '@/ui/Icon'
import { useUIStore } from '@/store/ui'
import { formatPercent } from '@/lib/money'
import type { Account } from '@/db/types'
import { useAccountsView } from './db'
import { TYPE_LABEL, type AccountSummary, type CardSummary } from './accounts'
import { AccountTile } from './components/AccountTile'
import { AccountForm } from './components/AccountForm'

export function AccountsScreen() {
  const view = useAccountsView()
  const openQuickAdd = useUIStore((s) => s.openQuickAdd)

  const [editing, setEditing] = useState<Account | undefined>()
  const [formOpen, setFormOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const edit = (account: Account) => {
    setEditing(account)
    setFormOpen(true)
  }

  const add = () => {
    setEditing(undefined)
    setFormOpen(true)
  }

  return (
    <Screen
      title="Accounts"
      back
      actions={
        <button type="button" className="icon-btn" aria-label="Add account" onClick={add}>
          <PlusIcon size={20} />
        </button>
      }
    >
      {view === undefined ? (
        <div aria-hidden="true" className="h-44 animate-pulse rounded-[20px] bg-surface" />
      ) : (
        <>
          <section className="rounded-[20px] bg-contrast p-5 text-contrast-ink">
            <p className="text-meta opacity-80">Net worth</p>
            <Money value={view.netWorth.total} whole className="my-0.5 block text-[34px] font-bold" />

            <div className="mt-3 flex gap-5 text-meta opacity-80">
              <span>
                Assets{' '}
                <Money
                  value={view.netWorth.assets}
                  whole
                  className="font-semibold text-contrast-ink"
                />
              </span>
              <span>
                Credit{' '}
                <Money
                  value={view.netWorth.credit}
                  whole
                  className="font-semibold text-negative-on-contrast"
                />
              </span>
            </div>

            <button
              type="button"
              onClick={() => openQuickAdd({ type: 'transfer' })}
              className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-ctl bg-surface font-semibold text-ink"
            >
              <LoansIcon size={18} />
              Transfer between accounts
            </button>
          </section>

          {view.spending.length > 0 && (
            <section>
              <h2 className="label mb-1.5 mt-2 px-1">Cash &amp; bank</h2>
              <div className="card py-1">
                {view.spending.map((summary) => (
                  <AccountRow key={summary.account.id} summary={summary} onEdit={edit} />
                ))}
              </div>
            </section>
          )}

          {view.cards.length > 0 && (
            <section className="flex flex-col gap-3.5">
              <h2 className="label -mb-1 mt-2 px-1">
                {view.cards.length === 1 ? 'Credit card' : 'Credit cards'}
              </h2>
              {view.cards.map((card) => (
                <CreditCard
                  key={card.account.id}
                  card={card}
                  onEdit={edit}
                  onPay={() => openQuickAdd({ type: 'transfer', toAccountId: card.account.id })}
                />
              ))}
            </section>
          )}

          {view.spending.length === 0 && view.cards.length === 0 && (
            <section className="card text-center">
              <p className="font-medium">No accounts yet</p>
              <p className="mt-1 text-meta text-muted">
                Add the wallets, banks and cards you actually use.
              </p>
              <button type="button" className="btn-primary mt-4 w-full" onClick={add}>
                Add an account
              </button>
            </section>
          )}

          {view.archived.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowArchived((shown) => !shown)}
                aria-expanded={showArchived}
                aria-controls="archived-accounts"
                className="flex min-h-[52px] items-center justify-between px-1 text-sm text-muted"
              >
                {view.archived.length} archived{' '}
                {view.archived.length === 1 ? 'account' : 'accounts'}
                <ChevronRightIcon
                  size={18}
                  className={showArchived ? 'rotate-90 transition-transform' : 'transition-transform'}
                />
              </button>

              {showArchived && (
                <div id="archived-accounts" className="card py-1">
                  {view.archived.map((summary) => (
                    <AccountRow key={summary.account.id} summary={summary} onEdit={edit} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      <AccountForm open={formOpen} onClose={() => setFormOpen(false)} account={editing} />
    </Screen>
  )
}

function AccountRow({
  summary,
  onEdit,
}: {
  summary: AccountSummary
  onEdit: (account: Account) => void
}) {
  const { account, balance } = summary

  return (
    <button
      type="button"
      onClick={() => onEdit(account)}
      aria-label={`Edit ${account.name}`}
      className="list-row w-full text-left"
    >
      <AccountTile type={account.type} color={account.color} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{account.name}</span>
        <span className="block text-meta text-muted">{TYPE_LABEL[account.type]}</span>
      </span>
      <Money value={balance} tone={balance < 0 ? 'negative' : 'plain'} whole className="font-semibold" />
      {/* The row opens the editor; without this it reads as a link to a
          detail screen that does not exist. */}
      <EditIcon size={16} aria-hidden="true" className="flex-none text-muted" />
    </button>
  )
}

function CreditCard({
  card,
  onEdit,
  onPay,
}: {
  card: CardSummary
  onEdit: (account: Account) => void
  onPay: () => void
}) {
  const over = card.limit > 0 && card.utilization > 1

  return (
    <section className="card p-4">
      <button
        type="button"
        onClick={() => onEdit(card.account)}
        aria-label={`Edit ${card.account.name}`}
        className="flex w-full items-center gap-3 text-left"
      >
        <AccountTile type="credit" color={card.account.color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{card.account.name}</span>
          <span className="block text-meta text-muted">
            {card.cycle ?? 'No statement dates set'}
          </span>
        </span>
        <Money value={card.balance} tone="negative" whole className="font-semibold" />
        <EditIcon size={16} aria-hidden="true" className="flex-none text-muted" />
      </button>

      {card.limit > 0 ? (
        <>
          <Meter
            value={card.utilization}
            color="rgb(var(--c-negative))"
            className="mb-1.5 mt-3.5"
          />
          <div className="flex justify-between">
            <p className="text-meta text-muted">
              {formatPercent(card.utilization)} of <Money value={card.limit} compact />{' '}
              limit
            </p>
            <p className="text-meta text-muted">
              <Money
                value={card.available}
                tone={over ? 'negative' : 'plain'}
                whole
                className="font-semibold"
              />{' '}
              {over ? 'over' : 'available'}
            </p>
          </div>
        </>
      ) : (
        <p className="mt-3 text-meta text-muted">
          Set a credit limit to track how much of it you are using.
        </p>
      )}

      <button type="button" onClick={onPay} className="btn-secondary mt-3 w-full">
        Pay this card
      </button>
    </section>
  )
}
