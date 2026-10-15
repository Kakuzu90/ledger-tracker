import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './Icon'

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  /** Header button to the right of the title. */
  action?: ReactNode
  /** Fill the screen below the handle, so content can pin to the bottom. */
  fill?: boolean
  /**
   * There is unsaved input in here, so a stray tap on the backdrop should
   * not throw it away. Dismissing asks first; the sheet's own Save path
   * calls `onClose` directly and is never questioned.
   */
  confirmDiscard?: boolean
  /** Wording for that prompt, when "entry" is not what is being thrown away. */
  discardCopy?: { title: string; detail: string }
  children?: ReactNode
}

const DISCARD_COPY = {
  title: 'Discard this entry?',
  detail: 'What you have typed will not be saved.',
}

/** What the Tab trap counts as a stop. Matches the browser's own list. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const stops = (root: HTMLElement): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    // Rendered, so `display: none` branches drop out. The transparent
    // overlay controls on the Quick Add chips are kept: they are invisible
    // but genuinely focusable, and skipping them would strand them.
    (element) => element.getClientRects().length > 0,
  )

/** Bottom sheet — the QuickAdd container, per design/QuickAdd.dc.html. */
export function Sheet({
  open,
  onClose,
  title,
  action,
  fill = false,
  confirmDiscard = false,
  discardCopy = DISCARD_COPY,
  children,
}: SheetProps) {
  const panel = useRef<HTMLDivElement>(null)
  const prompt = useRef<HTMLDivElement>(null)
  /** What had focus before the sheet opened, to hand it back on close. */
  const opener = useRef<HTMLElement | null>(null)
  const [asking, setAsking] = useState(false)

  // A sheet that closed while the discard prompt was up should not come
  // back still asking. Adjusted during render rather than in an effect, so
  // the stale frame is never painted — the same shape `useReorder` uses.
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (asking) setAsking(false)
  }

  /** A dismissal the user asked for: the backdrop, Escape, or the X. */
  const dismiss = useCallback(() => {
    if (confirmDiscard) {
      setAsking(true)
      return
    }
    onClose()
  }, [confirmDiscard, onClose])

  /*
   * The open effect reads this rather than depending on it. Callers pass
   * `onClose` inline, so `dismiss` is a new function every render — as a
   * dependency it tore the effect down and set it up again on each
   * keystroke, and the setup moves focus to the panel. Typing one letter
   * into a field in a sheet lost the field.
   */
  const latestDismiss = useRef(dismiss)
  useEffect(() => {
    latestDismiss.current = dismiss
  })

  useEffect(() => {
    if (!open) return

    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (prompt.current) setAsking(false)
        else latestDismiss.current()
        return
      }
      // While the discard prompt is up it is the modal, not the sheet.
      const trap = prompt.current ?? panel.current
      if (event.key !== 'Tab' || !trap) return

      /*
       * Hold Tab inside the panel. `aria-modal` tells a screen reader the
       * rest of the page is out of bounds, but it does nothing for the Tab
       * key, and without this the next stop after the last control is the
       * dashboard behind the sheet.
       */
      const items = stops(trap)
      if (items.length === 0) {
        event.preventDefault()
        trap.focus()
        return
      }

      const first = items[0] as HTMLElement
      const last = items[items.length - 1] as HTMLElement
      const active = document.activeElement

      if (event.shiftKey && (active === first || active === trap)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    // The sheet is portalled out of the app root, so the root can be made
    // inert for the pointer and the accessibility tree both.
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    panel.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      root?.removeAttribute('inert')
      // Back where it came from, so Tab carries on from the control that
      // opened the sheet rather than restarting at the top of the page.
      opener.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (asking) prompt.current?.focus()
  }, [asking])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div aria-hidden="true" onClick={dismiss} className="absolute inset-0 bg-ink/50" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        // Installed on a phone with a home indicator, the last button in a
        // sheet would otherwise sit under it.
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        /*
         * Bottom-aligned and only as tall as it needs to be. The wrapper
         * is a flex row, so without `items-end` the panel inherited
         * `align-items: stretch` and filled the screen however little was
         * in it — a five-row filter sat in 764px of sheet.
         */
        className={`relative flex w-full max-w-screen flex-col gap-3 rounded-t-[24px] bg-bg px-5 pt-2.5 shadow-sheet outline-none short:gap-2 ${
          fill ? 'h-[calc(100dvh-48px)]' : 'max-h-[calc(100dvh-48px)] overflow-y-auto'
        }`}
      >
        <div aria-hidden="true" className="h-[5px] w-10 self-center rounded-full bg-border-strong" />
        <div className="flex items-center justify-between">
          <button type="button" className="icon-btn" aria-label="Close" onClick={dismiss}>
            <CloseIcon size={20} />
          </button>
          <h2 className="text-screen-sub">{title}</h2>
          <div className="flex h-touch w-touch items-center justify-center">{action}</div>
        </div>

        {children}

        {asking && (
          <div className="absolute inset-0 z-10 flex items-end rounded-t-[24px] bg-ink/50 p-5">
            <div
              ref={prompt}
              role="alertdialog"
              aria-modal="true"
              aria-label={discardCopy.title}
              tabIndex={-1}
              className="card w-full outline-none"
            >
              <p className="font-medium">{discardCopy.title}</p>
              <p className="mt-1 text-meta text-muted">{discardCopy.detail}</p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setAsking(false)}
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  className="min-h-[48px] flex-1 rounded-btn bg-negative px-[18px] font-semibold text-negative-ink"
                  onClick={onClose}
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
