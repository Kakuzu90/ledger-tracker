import { useMemo } from 'react'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import { Screen } from '@/ui/Screen'
import { EyeIcon, EyeOffIcon, SettingsIcon } from '@/ui/Icon'
import { useUIStore } from '@/store/ui'
import { useDashboard, useUserName } from './db'
import { InstallBanner } from './components/InstallBanner'
import { useInstallPrompt } from './hooks/useInstallPrompt'
import {
  BackupCard,
  BillsCard,
  BudgetCard,
  LoansCard,
  NetBalanceCard,
  RecentCard,
} from './components/Cards'

/** Placeholder blocks while the first query resolves. */
function Skeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3.5">
      {[132, 104, 168, 148].map((height, i) => (
        <div
          key={i}
          className="animate-pulse rounded-card border border-border bg-surface"
          style={{ height }}
        />
      ))}
    </div>
  )
}

export function HomeScreen() {
  // One Date for the render, so every card agrees on what "today" is.
  const today = useMemo(() => new Date(), [])

  const dashboard = useDashboard(today)
  const name = useUserName()
  const installPrompt = useInstallPrompt()
  const amountsHidden = useUIStore((s) => s.amountsHidden)
  const toggleAmounts = useUIStore((s) => s.toggleAmounts)

  return (
    <Screen
      eyebrow={format(today, 'EEEE, MMM d')}
      title={name ? `Hi, ${name}` : 'Ledger'}
      actions={
        <>
          <button
            type="button"
            className="icon-btn"
            aria-label={amountsHidden ? 'Show amounts' : 'Hide amounts'}
            aria-pressed={amountsHidden}
            onClick={toggleAmounts}
          >
            {amountsHidden ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
          </button>
          <Link to="/settings" className="icon-btn" aria-label="Settings">
            <SettingsIcon size={20} />
          </Link>
        </>
      }
    >
      <InstallBanner prompt={installPrompt} />

      {dashboard === undefined ? (
        <Skeleton />
      ) : (
        <>
          <NetBalanceCard
            netWorth={dashboard.netWorth}
            month={dashboard.month}
            monthLabel={format(today, 'MMM')}
            accountSummary={dashboard.accountSummary}
          />

          {dashboard.budget && (
            <BudgetCard budget={dashboard.budget} monthLabel={format(today, 'MMMM')} />
          )}

          <LoansCard loans={dashboard.loans} />
          <BillsCard bills={dashboard.bills} />
          <RecentCard recent={dashboard.recent} />
          <BackupCard days={dashboard.backupAge} />
        </>
      )}
    </Screen>
  )
}
