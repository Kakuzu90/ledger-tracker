import { useEffect, useRef, type ReactNode } from 'react'
import { CloseIcon } from './Icon'

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  /** Header button to the right of the title. */
  action?: ReactNode
  children?: ReactNode
}

/** Bottom sheet — the QuickAdd container, per design/QuickAdd.dc.html. */
export function Sheet({ open, onClose, title, action, children }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-center">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink/50"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative mt-12 flex w-full max-w-screen flex-col gap-3 rounded-t-[24px] bg-bg px-5 pb-6 pt-2.5 shadow-sheet outline-none"
      >
        <div className="h-[5px] w-10 self-center rounded-full bg-border-strong" />
        <div className="flex items-center justify-between">
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon size={20} />
          </button>
          <h2 className="text-screen-sub">{title}</h2>
          <div className="flex h-touch w-touch items-center justify-center">{action}</div>
        </div>
        {children}
      </div>
    </div>
  )
}
