import { create } from 'zustand'

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
}

export const useUIStore = create<UIState>((set) => ({
  quickAddOpen: false,
  quickAddSession: 0,
  openQuickAdd: () => set((s) => ({ quickAddOpen: true, quickAddSession: s.quickAddSession + 1 })),
  closeQuickAdd: () => set({ quickAddOpen: false }),
  amountsHidden: false,
  toggleAmounts: () => set((s) => ({ amountsHidden: !s.amountsHidden })),
}))
