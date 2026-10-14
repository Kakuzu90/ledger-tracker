import { useEffect } from 'react'
import { Outlet, ScrollRestoration } from 'react-router-dom'
import { QuickAddSheet } from '@/features/quick-add/QuickAddSheet'
import { UpdateBanner } from '@/ui/UpdateBanner'
import { Snackbar } from '@/ui/Snackbar'
import { loadTheme } from '@/lib/theme'
import { bootstrapDatabase } from '@/db/bootstrap'
import { runSchedule } from '@/features/bills/db'
import {
  applyStartupPreferences,
  askForPersistenceOnce,
  runReminders,
} from '@/features/settings/db'
import { LockOverlay } from '@/features/lock/LockOverlay'
import { markAway, resolveLockOnLaunch, shouldLockOnReturn } from '@/features/lock/db'
import { parseLaunchAction, withoutLaunchAction } from '@/lib/launch'
import { useLockStore } from '@/store/lock'
import { useUIStore } from '@/store/ui'

export function App() {
  const status = useLockStore((s) => s.status)

  useEffect(() => {
    void loadTheme()

    void (async () => {
      // Before anything else, and before anything is drawn: whether this
      // launch is allowed to show the ledger at all.
      const locked = await resolveLockOnLaunch()
      const lock = useLockStore.getState()
      if (locked) lock.lock()
      else lock.open()

      // Default categories and settings; sample data in dev.
      await bootstrapDatabase()
      // Ask the browser not to evict the ledger. There is no server copy,
      // so this is the difference between losing data and not.
      await askForPersistenceOnce()
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

  /**
   * Auto-lock. Leaving is recorded rather than timed, so a phone asleep for
   * an hour and a tab in the background for an hour are treated alike, and
   * nothing has to keep running while the app is away.
   */
  useEffect(() => {
    const onHidden = () => {
      if (useLockStore.getState().status === 'open') void markAway()
    }

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (useLockStore.getState().status !== 'open') return
      void shouldLockOnReturn().then((lock) => {
        if (lock) useLockStore.getState().lock()
      })
    }

    const onVisibility = () =>
      document.visibilityState === 'hidden' ? onHidden() : onVisible()

    document.addEventListener('visibilitychange', onVisibility)
    // Mobile Safari can skip straight to this without a visibility change.
    window.addEventListener('pagehide', onHidden)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onHidden)
    }
  }, [])

  /**
   * The manifest's "Add an expense" shortcut. It is a parameter rather than
   * a route because Quick Add is a sheet, and it waits for the lock: a
   * shortcut should not open the sheet behind a PIN prompt.
   */
  useEffect(() => {
    if (status !== 'open') return

    const action = parseLaunchAction(window.location.search)
    if (!action) return

    // Spent once. Left in place, a refresh would reopen the sheet and the
    // address bar would keep an instruction that has already been carried out.
    window.history.replaceState(null, '', withoutLaunchAction(window.location.href))
    useUIStore.getState().openQuickAdd({ type: action.type })
  }, [status])

  // Nothing at all until the lock has had its say. One blank frame beats
  // painting a dashboard and covering it a moment later.
  if (status === 'unknown') return <div className="min-h-dvh bg-bg" />
  if (status === 'locked') return <LockOverlay />

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
