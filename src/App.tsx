import { useEffect } from 'react'
import { Outlet, ScrollRestoration } from 'react-router-dom'
import { QuickAddSheet } from '@/features/quick-add/QuickAddSheet'
import { UpdateBanner } from '@/ui/UpdateBanner'
import { Snackbar } from '@/ui/Snackbar'
import { loadTheme } from '@/lib/theme'
import { requestPersistentStorage } from '@/lib/storage'
import { bootstrapDatabase } from '@/db/bootstrap'
import { runSchedule } from '@/features/bills/db'
import { applyStartupPreferences, runReminders } from '@/features/settings/db'

export function App() {
  useEffect(() => {
    void loadTheme()
    // Asked once on first launch; the browser remembers the grant.
    void requestPersistentStorage()

    void (async () => {
      // Default categories and settings; sample data in dev.
      await bootstrapDatabase()
      // Currency and "hide amounts on open", which have to be in force
      // before the first screen prints a number.
      await applyStartupPreferences()
      // Everything that came due while the app was closed. Auto rules post,
      // confirm rules land in Activity waiting for a yes. Safe to run twice:
      // a rule moves on in the same transaction that materialises it.
      await runSchedule()
      // Bills, loans and budgets — each one only if it was switched on, and
      // at most once a day.
      await runReminders()
    })()
  }, [])

  return (
    <>
      <ScrollRestoration />
      <Outlet />
      <QuickAddSheet />
      <Snackbar />
      <UpdateBanner />
    </>
  )
}
