import { useMemo, useState } from 'react'
import { Screen } from '@/ui/Screen'
import { Sheet } from '@/ui/Sheet'
import { Segmented } from '@/ui/Segmented'
import { Toggle } from '@/ui/Toggle'
import { Badge, Row, RowGroup } from '@/ui/Rows'
import { CheckIcon } from '@/ui/Icon'
import { useUIStore } from '@/store/ui'
import { CURRENCIES, currencyLabel } from '@/lib/money'
import { NEAR_LIMIT } from '@/lib/budgets'
import { askForNotifications } from '@/lib/notifications'
import type { ThemePref } from '@/lib/theme'
import { useSettingsData, savePreference } from './db'
import { buildSettingsView } from './settings'

const THEMES: ReadonlyArray<{ value: ThemePref; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

/**
 * Settings (design/Settings.dc.html).
 *
 * Rows the app cannot honour yet carry a "Later" badge rather than a switch
 * that does nothing. That is the mockup's own idiom — it marks cross-device
 * sync the same way — and it is the only honest way to show a screen whose
 * design runs ahead of what is built.
 */
export function SettingsScreen() {
  const data = useSettingsData()
  const showSnack = useUIStore((s) => s.showSnack)
  const today = useMemo(() => new Date(), [])

  const [picking, setPicking] = useState<'currency' | 'name' | null>(null)
  const [name, setName] = useState('')

  const view = useMemo(() => (data ? buildSettingsView(data, today) : undefined), [data, today])

  if (!view) {
    return (
      <Screen title="Settings" back>
        <div aria-hidden="true" className="h-64 animate-pulse rounded-card bg-surface" />
      </Screen>
    )
  }

  const { preferences: prefs, counts } = view

  /**
   * A reminder is only worth storing as "on" if the browser will actually
   * show it, so switching one on asks for permission first.
   */
  const setReminder = async (
    key: 'billReminders' | 'loanReminders' | 'budgetAlerts',
    on: boolean,
  ) => {
    if (!on) {
      await savePreference(key, false)
      return
    }

    const state = await askForNotifications()
    if (state !== 'granted') {
      showSnack({
        message:
          state === 'denied'
            ? 'Notifications are blocked for this site'
            : 'Notifications are not available here',
      })
      return
    }
    await savePreference(key, true)
  }

  const notifyHint = (hint: string) =>
    view.notifications === 'denied' ? 'Blocked in your browser settings' : hint

  return (
    <Screen title="Settings" back>
      <p className="label mt-1">Preferences</p>
      <RowGroup>
        <Row
          label="Your name"
          hint="Used in the greeting on Home"
          value={prefs.name || 'Not set'}
          onClick={() => {
            setName(prefs.name)
            setPicking('name')
          }}
        />
        <Row
          label="Currency"
          value={view.currencyLabel}
          onClick={() => setPicking('currency')}
        />
        <Row
          label="Theme"
          chevron={false}
          value={
            <div className="w-[196px]">
              <Segmented
                label="Theme"
                options={THEMES}
                value={prefs.theme}
                onChange={(theme) => void savePreference('theme', theme)}
              />
            </div>
          }
        />
        <Row
          label="Month starts on"
          hint="Budgets and reports use calendar months"
          value={<Badge>Later</Badge>}
          chevron={false}
        />
        <Row
          label="Multiple currencies"
          hint="Per-account currency, manual rates"
          value={<Badge>Later</Badge>}
          chevron={false}
        />
      </RowGroup>

      <p className="label mt-1">Organize</p>
      <RowGroup>
        <Row
          to="/settings/categories"
          label="Categories & tags"
          value={view.organiseLabel}
        />
        <Row to="/accounts" label="Accounts" value={counts.accounts} />
        <Row to="/bills" label="Recurring rules" value={counts.rules} />
        <Row
          label="Contacts"
          hint="Added as you record loans"
          value={counts.contacts}
          chevron={false}
        />
      </RowGroup>

      <p className="label mt-1">Security</p>
      <RowGroup>
        <Row
          label="PIN lock"
          hint="The lock screen is not built yet"
          value={<Badge>Later</Badge>}
          chevron={false}
        />
        <Row
          label="Fingerprint / Face unlock"
          value={<Badge>Later</Badge>}
          chevron={false}
        />
        <Toggle
          label="Hide amounts on open"
          hint="Tap the eye on Home to reveal"
          checked={prefs.hideAmountsOnOpen}
          onChange={(on) => void savePreference('hideAmountsOnOpen', on)}
        />
      </RowGroup>

      <p className="label mt-1">Notifications</p>
      <RowGroup>
        <Toggle
          label="Bill reminders"
          hint={notifyHint('When Ledger is opened, a day ahead')}
          checked={prefs.billReminders}
          disabled={!view.canNotify}
          onChange={(on) => void setReminder('billReminders', on)}
        />
        <Toggle
          label="Loan due reminders"
          hint={notifyHint('Personal and formal loans')}
          checked={prefs.loanReminders}
          disabled={!view.canNotify}
          onChange={(on) => void setReminder('loanReminders', on)}
        />
        <Toggle
          label="Budget alerts"
          hint={notifyHint(`At ${Math.round(NEAR_LIMIT * 100)}% and 100%`)}
          checked={prefs.budgetAlerts}
          disabled={!view.canNotify}
          onChange={(on) => void setReminder('budgetAlerts', on)}
        />
        <Row
          label="Daily log nudge"
          hint="Needs a server to wake the app at a set time"
          value={<Badge>Later</Badge>}
          chevron={false}
        />
      </RowGroup>
      <p className="px-1 text-meta text-muted">
        With no server behind it, Ledger can only check what is due when you
        open it. Reminders are raised then, at most once a day.
      </p>

      <p className="label mt-1">Data</p>
      <RowGroup>
        <Row
          to="/settings/backup"
          label="Backup & export"
          value={view.backupLabel}
          alert={view.backupOverdue}
        />
        <Row label="App version" value={view.version} chevron={false} />
      </RowGroup>

      <Sheet
        open={picking === 'name'}
        onClose={() => setPicking(null)}
        title="Your name"
      >
        <label className="block">
          <span className="label">Name</span>
          <input
            className="field mt-1"
            value={name}
            autoFocus
            placeholder="Alex"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn-primary w-full"
          onClick={() => {
            void savePreference('name', name.trim())
            setPicking(null)
          }}
        >
          Save
        </button>
      </Sheet>

      <Sheet
        open={picking === 'currency'}
        onClose={() => setPicking(null)}
        title="Currency"
      >
        <p className="text-meta text-muted">
          Amounts are stored to the cent, so currencies without cents are not
          offered. Changing this re-labels existing amounts; it does not
          convert them.
        </p>
        <RowGroup>
          {CURRENCIES.map((currency) => (
            <Row
              key={currency.code}
              label={currencyLabel(currency.code)}
              hint={currency.name}
              chevron={false}
              onClick={() => {
                void savePreference('currency', currency.code)
                setPicking(null)
              }}
              value={
                currency.code === prefs.currency ? (
                  <CheckIcon className="text-primary" />
                ) : undefined
              }
            />
          ))}
        </RowGroup>
      </Sheet>
    </Screen>
  )
}
