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
import { LockOverlay } from '@/features/lock/LockOverlay'
import { markAway, resolveLockOnLaunch, shouldLockOnReturn } from '@/features/lock/db'
import { useLockStore } from '@/store/lock'

export function App() {
  const status = useLockStore((s) => s.status)

  useEffect(() => {
    void loadTheme()
    // Asked once on first launch; the browser remembers the grant.
    void requestPersistentStorage()

    void (async () => {
      // Before anything else, and before anything is drawn: whether this
      // launch is allowed to show the ledger at all.
      const locked = await resolveLockOnLaunch()
      const lock = useLockStore.getState()
      if (locked) lock.lock()
      else lock.open()

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
