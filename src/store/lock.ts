import { create } from 'zustand'

/**
 * Whether the app is behind the lock. `unknown` is the state before the
 * first read of the database has come back: the screens render nothing
 * until it resolves, because flashing a dashboard for one frame and then
 * covering it is exactly the leak the lock exists to prevent.
 */
export type LockStatus = 'unknown' | 'locked' | 'open'

interface LockState {
  status: LockStatus
  /** Set once per page load; a cold start always locks. */
  setStatus: (status: LockStatus) => void
  lock: () => void
  open: () => void
}

export const useLockStore = create<LockState>((set) => ({
  status: 'unknown',
  setStatus: (status) => set({ status }),
  lock: () => set({ status: 'locked' }),
  open: () => set({ status: 'open' }),
}))
