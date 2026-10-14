import { Link } from 'react-router-dom'
import { Placeholder, Screen } from '@/ui/Screen'
import { CalendarIcon, DownloadIcon } from '@/ui/Icon'

export function ActivityScreen() {
  return (
    <Screen
      title="Activity"
      actions={
        <>
          <Link to="/activity/calendar" className="icon-btn" aria-label="Calendar view">
            <CalendarIcon size={20} />
          </Link>
          <button type="button" className="icon-btn" aria-label="Export CSV">
            <DownloadIcon size={20} />
          </button>
        </>
      }
    >
      <Placeholder mockup="Activity.dc.html" />
    </Screen>
  )
}
