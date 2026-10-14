import { create } from 'zustand'

/** UI-only state. Nothing here is persisted — app data lives in IndexedDB. */
interface UIState {
  quickAddOpen: boolean
  openQuickAdd: () => void
  closeQuickAdd: () => void
  /** "Hide amounts" toggle in the home header. */
  amountsHidden: boolean
  toggleAmounts: () => void
}

export const useUIStore = create<UIState>((set) => ({
  quickAddOpen: false,
  openQuickAdd: () => set({ quickAddOpen: true }),
  closeQuickAdd: () => set({ quickAddOpen: false }),
  amountsHidden: false,
  toggleAmounts: () => set((s) => ({ amountsHidden: !s.amountsHidden })),
}))
