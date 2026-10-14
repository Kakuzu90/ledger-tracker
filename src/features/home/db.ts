import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { buildDashboard, type Dashboard } from './dashboard'

/**
 * One live query for the whole screen, so a write re-renders it once.
 *
 * Balances run from each account's opening balance, so this reads the full
 * transaction table rather than a window of it. For a single-user ledger that
 * is a few thousand rows at most; if it ever stops being cheap, the fix is a
 * stored running balance per account, not a narrower query.
 */
export function useDashboard(today: Date = new Date()): Dashboard | undefined {
  return useLiveQuery(async () => {
    const [
      accounts,
      categories,
      transactions,
      budgets,
      loans,
      loanPayments,
      recurring,
      lastBackup,
    ] = await Promise.all([
      db.accounts.toArray(),
      db.categories.toArray(),
      db.transactions.toArray(),
      db.budgets.toArray(),
      db.loans.toArray(),
      db.loanPayments.toArray(),
      db.recurring.toArray(),
      db.settings.get('lastBackupAt'),
    ])

    return buildDashboard(
      {
        accounts,
        categories,
        transactions,
        budgets,
        loans,
        loanPayments,
        recurring,
        ...(typeof lastBackup?.value === 'string' ? { lastBackupAt: lastBackup.value } : {}),
      },
      today,
    )
    // `today` is a Date; key on the day so the query is not rebuilt each render.
  }, [today.toDateString()])
}

/** The name used in the greeting, if the user has set one. */
export function useUserName(): string | undefined {
  const row = useLiveQuery(() => db.settings.get('name'), [])
  const value = row?.value
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}
