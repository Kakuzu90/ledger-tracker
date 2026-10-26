import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { isFirebaseConfigured } from '@/lib/firebase'
import { syncStateFrom, type SyncState } from '@/lib/sync'
import { lastAttemptFailed, onSyncSettled, syncEnabled } from './db'

function subscribeToNetwork(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** Whether the browser believes it has a network. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeToNetwork,
    () => navigator.onLine,
    () => true,
  )
}

export interface SyncRow {
  state: SyncState
  queued: number
  enabled: boolean
  setEnabled: (on: boolean) => void
}

/**
 * Everything the Settings row needs. The queued count is live, so the
 * row empties itself as the batches go up rather than waiting to be
 * revisited.
 */
export function useSyncRow(): SyncRow {
  const [enabled, setEnabled] = useState(false)
  const online = useOnline()
  const queued = useLiveQuery(() => db.outbox.count(), [], 0)
  // A failed attempt moves nothing in the database, so the live count
  // above would never bring the news.
  const failed = useSyncExternalStore(onSyncSettled, lastAttemptFailed, () => false)

  useEffect(() => {
    void syncEnabled().then(setEnabled)
  }, [])

  return {
    enabled,
    setEnabled,
    queued,
    state: syncStateFrom({
      enabled,
      configured: isFirebaseConfigured(),
      online,
      queued,
      failed,
    }),
  }
}
