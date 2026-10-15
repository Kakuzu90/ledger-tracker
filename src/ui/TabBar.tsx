import { NavLink } from 'react-router-dom'
import { ActivityIcon, HomeIcon, LoansIcon, PlusIcon, ReportsIcon } from './Icon'
import { useUIStore } from '@/store/ui'

const tabs = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/activity', label: 'Activity', Icon: ActivityIcon, end: false },
  { to: '/loans', label: 'Loans', Icon: LoansIcon, end: false },
  { to: '/reports', label: 'Reports', Icon: ReportsIcon, end: false },
] as const

function Tab({ to, label, Icon, end }: (typeof tabs)[number]) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex min-h-[52px] min-w-[60px] flex-col items-center justify-center gap-[3px] text-label normal-case tracking-normal no-underline ${
          isActive ? 'text-primary' : 'text-muted'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon aria-hidden="true" strokeWidth={isActive ? 2 : 1.8} />
          {label}
        </>
      )}
    </NavLink>
  )
}

export function TabBar() {
  const openQuickAdd = useUIStore((s) => s.openQuickAdd)

  return (
    /*
      The button sits outside the bar rather than in its row: the bar is
      masked to cut the cradle, and a mask clips everything inside it —
      the button included. The wrapper also carries the hairline, as a
      drop-shadow rather than a border, so it follows the curve instead
      of running straight across the gap.
    */
    <div
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-screen [filter:drop-shadow(0_-1px_0_rgb(var(--c-border)))]"
    >
      <nav
        aria-label="Main"
        className="tab-cradle flex h-tab justify-around bg-surface pt-2"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Tab {...tabs[0]} />
        <Tab {...tabs[1]} />
        {/* Holds the cradle's share of the row so the tabs stay even. */}
        <span aria-hidden="true" className="w-16 flex-none" />
        <Tab {...tabs[2]} />
        <Tab {...tabs[3]} />
      </nav>

      <button
        type="button"
        aria-label="Add transaction"
        onClick={() => openQuickAdd()}
        className="absolute left-1/2 top-0 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-br from-fab-from to-fab-to text-white shadow-fab"
      >
        <PlusIcon size={26} strokeWidth={2.4} />
      </button>
    </div>
  )
}
