import { create } from 'zustand'
import type { Draft } from '@/features/quick-add/draft'
import { DEFAULT_CURRENCY } from '@/lib/money'

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
  /** Fields the opener wants filled in, e.g. a transfer to a given card. */
  quickAddInitial: Partial<Draft> | null
  openQuickAdd: (initial?: Partial<Draft>) => void
  closeQuickAdd: () => void
  /** "Hide amounts" toggle in the home header. */
  amountsHidden: boolean
  toggleAmounts: () => void
  /** Set from the stored preference at launch. */
  setAmountsHidden: (hidden: boolean) => void
  /**
   * The currency every amount prints in. It is a stored preference, mirrored
   * here so that changing it re-renders the screens rather than waiting for
   * the next navigation.
   */
  currency: string
  setCurrency: (currency: string) => void
  /** The undo bar above the tab bar. One at a time, newest wins. */
  snack: Snack | null
  showSnack: (snack: Snack) => void
  dismissSnack: () => void
}

export const useUIStore = create<UIState>((set) => ({
  quickAddOpen: false,
  quickAddSession: 0,
  quickAddInitial: null,
  openQuickAdd: (initial) =>
    set((s) => ({
      quickAddOpen: true,
      quickAddSession: s.quickAddSession + 1,
      quickAddInitial: initial ?? null,
    })),
  closeQuickAdd: () => set({ quickAddOpen: false, quickAddInitial: null }),
  amountsHidden: false,
  toggleAmounts: () => set((s) => ({ amountsHidden: !s.amountsHidden })),
  setAmountsHidden: (amountsHidden) => set({ amountsHidden }),
  currency: DEFAULT_CURRENCY,
  setCurrency: (currency) => set({ currency }),
  snack: null,
  showSnack: (snack) => set({ snack }),
  dismissSnack: () => set({ snack: null }),
}))
