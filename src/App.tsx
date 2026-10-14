import { useEffect } from 'react'
import { Outlet, ScrollRestoration } from 'react-router-dom'
import { QuickAddSheet } from '@/features/quick-add/QuickAddSheet'
import { UpdateBanner } from '@/ui/UpdateBanner'
import { loadTheme } from '@/lib/theme'
import { requestPersistentStorage } from '@/lib/storage'
import { bootstrapDatabase } from '@/db/bootstrap'

export function App() {
  useEffect(() => {
    void loadTheme()
    // Asked once on first launch; the browser remembers the grant.
    void requestPersistentStorage()
    // Default categories and settings; sample data in dev.
    void bootstrapDatabase()
  }, [])

  return (
    <>
      <ScrollRestoration />
      <Outlet />
      <QuickAddSheet />
      <UpdateBanner />
    </>
  )
}
