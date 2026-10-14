import { useEffect } from 'react'
import { useUIStore } from '@/store/ui'

/** How long an undo stays on offer. */
const DISMISS_AFTER_MS = 6000

/**
 * The bar that floats above the tab bar after a destructive action, per
 * design/Activity.dc.html. It is a status region, so a screen reader
 * announces it without the focus moving.
 */
export function Snackbar() {
  const snack = useUIStore((s) => s.snack)
  const dismiss = useUIStore((s) => s.dismissSnack)

  useEffect(() => {
    if (!snack) return
    const timer = setTimeout(dismiss, DISMISS_AFTER_MS)
    return () => clearTimeout(timer)
  }, [snack, dismiss])

  if (!snack) return null

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[96px] z-40 mx-auto flex max-w-screen px-4"
    >
      <div className="pointer-events-auto flex w-full items-center justify-between gap-3 rounded-btn bg-contrast py-1.5 pl-4 pr-2 text-contrast-ink shadow-sheet">
        <span className="text-sm">{snack.message}</span>
        {snack.actionLabel && (
          <button
            type="button"
            onClick={() => {
              void snack.onAction?.()
              dismiss()
            }}
            className="min-h-touch px-3 text-sm font-semibold text-primary"
          >
            {snack.actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}
