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
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex h-tab max-w-screen justify-around border-t border-border bg-surface pt-2"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <Tab {...tabs[0]} />
      <Tab {...tabs[1]} />
      <button
        type="button"
        aria-label="Add transaction"
        onClick={() => openQuickAdd()}
        className="-mt-[26px] flex h-14 w-14 items-center justify-center rounded-[18px] bg-primary text-primary-ink shadow-fab"
      >
        <PlusIcon size={26} strokeWidth={2.2} />
      </button>
      <Tab {...tabs[2]} />
      <Tab {...tabs[3]} />
    </nav>
  )
}
