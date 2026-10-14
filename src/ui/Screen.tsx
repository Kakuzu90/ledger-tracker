import { useEffect, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeftIcon } from './Icon'

/*
 * A route change swaps the whole screen but leaves focus on the link that
 * was clicked, so a screen reader says nothing and a keyboard user carries
 * on from a control that is no longer there. Moving focus to the new title
 * is the usual answer. The first paint is exempt: nothing was navigated
 * from, and stealing focus on load would fight the browser.
 */
let navigated = false

interface ScreenProps {
  /** Large title for tab screens, compact centred title for sub-screens. */
  title: ReactNode
  /** Secondary line above the title (home shows the date here). */
  eyebrow?: ReactNode
  /** Sub-screens get a back button and no tab bar. */
  back?: boolean
  /** Header buttons, right-aligned. */
  actions?: ReactNode
  children?: ReactNode
}

/**
 * Screen chrome shared by every route: 390px-first column, header, and the
 * bottom padding that keeps content clear of the tab bar / FAB.
 */
export function Screen({ title, eyebrow, back = false, actions, children }: ScreenProps) {
  const navigate = useNavigate()
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!navigated) {
      navigated = true
      return
    }

    const element = heading.current
    if (!element) return

    /*
     * The tabindex is added for the moment it takes to move focus and
     * dropped again on the way out. Left on permanently, a tap on the
     * title would focus it too and draw a ring around a heading nobody
     * was interacting with.
     */
    element.setAttribute('tabindex', '-1')
    element.focus()

    const drop = () => element.removeAttribute('tabindex')
    element.addEventListener('blur', drop, { once: true })
    return () => element.removeEventListener('blur', drop)
  }, [])

  return (
    <div className="mx-auto min-h-dvh w-full max-w-screen">
      <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
        {back && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Back"
            onClick={() => navigate(-1)}
          >
            <ChevronLeftIcon size={20} />
          </button>
        )}

        <div className={back ? 'grow text-center' : 'grow'}>
          {eyebrow && <p className="text-meta text-muted">{eyebrow}</p>}
          <h1 ref={heading} className={back ? 'text-screen-sub' : 'text-screen'}>
            {title}
          </h1>
        </div>

        {/* Keeps a centred sub-screen title centred when there are no actions. */}
        <div className={`flex flex-none gap-2 ${back && !actions ? 'w-touch' : ''}`}>
          {actions}
        </div>
      </header>

      {/* Sub-screens have no tab bar or FAB to clear, only the home indicator. */}
      <div className={`flex flex-col gap-3.5 px-5 pt-1 ${back ? 'pb-16' : 'pb-28'}`}>
        {children}
      </div>
    </div>
  )
}

/** Placeholder body for routes that are scaffolded but not built yet. */
export function Placeholder({ mockup }: { mockup: string }) {
  return (
    <section className="card">
      <p className="label">Not built yet</p>
      <p className="mt-2 text-meta text-muted">
        Design reference: <code className="font-heading">design/{mockup}</code>
      </p>
    </section>
  )
}
