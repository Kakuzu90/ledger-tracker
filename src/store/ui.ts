import { create } from 'zustand'

export interface Snack {
  message: string
  /** Shown as a button; omit for a plain notice. */
  actionLabel?: string
  onAction?: () => void | Promise<void>
}

/** UI-only state. Nothing here is persisted — app data lives in IndexedDB. */
interface UIState {
  quickAddOpen: boolean
  /** Bumped on each open, so the sheet's form remounts with a clean draft. */
  quickAddSession: number
  openQuickAdd: () => void
  closeQuickAdd: () => void
  /** "Hide amounts" toggle in the home header. */
  amountsHidden: boolean
  toggleAmounts: () => void
  /** The undo bar above the tab bar. One at a time, newest wins. */
  snack: Snack | null
  showSnack: (snack: Snack) => void
  dismissSnack: () => void
}

export const useUIStore = create<UIState>((set) => ({
  quickAddOpen: false,
  quickAddSession: 0,
  openQuickAdd: () => set((s) => ({ quickAddOpen: true, quickAddSession: s.quickAddSession + 1 })),
  closeQuickAdd: () => set({ quickAddOpen: false }),
  amountsHidden: false,
  toggleAmounts: () => set((s) => ({ amountsHidden: !s.amountsHidden })),
  snack: null,
  showSnack: (snack) => set({ snack }),
  dismissSnack: () => set({ snack: null }),
}))
