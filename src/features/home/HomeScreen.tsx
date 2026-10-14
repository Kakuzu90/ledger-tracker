import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import { Placeholder, Screen } from '@/ui/Screen'
import { EyeIcon, SettingsIcon } from '@/ui/Icon'
import { useUIStore } from '@/store/ui'

export function HomeScreen() {
  const amountsHidden = useUIStore((s) => s.amountsHidden)
  const toggleAmounts = useUIStore((s) => s.toggleAmounts)

  return (
    <Screen
      eyebrow={format(new Date(), 'EEEE, MMM d')}
      title="Ledger"
      actions={
        <>
          <button
            type="button"
            className="icon-btn"
            aria-label={amountsHidden ? 'Show amounts' : 'Hide amounts'}
            aria-pressed={amountsHidden}
            onClick={toggleAmounts}
          >
            <EyeIcon size={20} />
          </button>
          <Link to="/settings" className="icon-btn" aria-label="Settings">
            <SettingsIcon size={20} />
          </Link>
        </>
      }
    >
      <Placeholder mockup="Main.dc.html" />
    </Screen>
  )
}
