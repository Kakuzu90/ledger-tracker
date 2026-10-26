import { useEffect, useMemo, useState } from 'react'
import { Screen } from '@/ui/Screen'
import { Sheet } from '@/ui/Sheet'
import { Segmented } from '@/ui/Segmented'
import { Toggle } from '@/ui/Toggle'
import { Badge, ChoiceRow, Row, RowGroup } from '@/ui/Rows'
import { useUIStore } from '@/store/ui'
import { CURRENCIES, currencyLabel } from '@/lib/money'
import { NEAR_LIMIT } from '@/lib/budgets'
import { askForNotifications } from '@/lib/notifications'
import { AUTO_LOCKS, autoLockLabel } from '@/lib/pin'
import { biometricsAvailable, describeError } from '@/lib/webauthn'
import type { ThemePref } from '@/lib/theme'
import {
  disableBiometrics,
  enableBiometrics,
  removePin,
  setPin,
} from '@/features/lock/db'
import { PinSheet } from '@/features/lock/components/PinSheet'
import { useLockStore } from '@/store/lock'
import { disablePush, enablePush, pushState } from '@/features/push/db'
import { canEnablePush, PUSH_HINT, type PushState } from '@/features/push/push'
import { disableSync, enableSync } from '@/features/sync/db'
import { useSyncRow } from '@/features/sync/hooks'
import { queuedLabel, SYNC_HINT } from '@/lib/sync'
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
 * The few rows the app still cannot honour carry a "Later" badge rather
 * than a switch that does nothing. That is the mockup's own idiom — it
 * marks cross-device sync the same way — and it is the only honest way to
 * show a screen whose design runs ahead of what is built.
 */
export function SettingsScreen() {
  const data = useSettingsData()
  const showSnack = useUIStore((s) => s.showSnack)
  const today = useMemo(() => new Date(), [])

  const [picking, setPicking] = useState<'currency' | 'name' | 'autoLock' | null>(null)
  const [name, setName] = useState('')
  const [asking, setAsking] = useState<'set' | 'remove' | null>(null)
  const [canUseBiometrics, setCanUseBiometrics] = useState(false)
  const [push, setPush] = useState<PushState>('unconfigured')
  const sync = useSyncRow()

  // Whether this device has a fingerprint reader or a face camera the
  // browser will talk to. A USB key is not what the row is offering.
  useEffect(() => {
    void biometricsAvailable().then(setCanUseBiometrics)
  }, [])

  // Reads where push stands without asking for anything, so opening
  // Settings never triggers a permission prompt.
  useEffect(() => {
    void pushState().then(setPush)
  }, [])

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

  const togglePush = async (on: boolean) => {
    const next = on ? await enablePush() : await disablePush()
    setPush(next)
    if (on && next !== 'on') showSnack({ message: PUSH_HINT[next] })
  }

  const toggleSync = async (on: boolean) => {
    // Optimistic: the switch is a preference, and turning it on cannot
    // fail — the first upload can, and the hint below says so when it
    // does.
    sync.setEnabled(on)
    if (on) await enableSync()
    else await disableSync()
  }

  /** Enrolling runs the device's own prompt, which can be declined. */
  const setBiometrics = async (on: boolean) => {
    if (!on) {
      await disableBiometrics()
      return
    }
    try {
      await enableBiometrics(prefs.name)
      showSnack({ message: 'This device can unlock Ledger now' })
    } catch (error) {
      showSnack({ message: describeError(error) })
    }
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
        <div className="border-b border-divider py-3 last:border-b-0">
          <p className="mb-2 font-medium">Theme</p>
          <Segmented
            label="Theme"
            options={THEMES}
            value={prefs.theme}
            onChange={(theme) => void savePreference('theme', theme)}
          />
        </div>
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
        {/*
          The only other way in is the Home budget card, and that card is
          not drawn unless an overall budget exists for the month — so
          without this row a month with no budget had no way to set one.
        */}
        <Row
          to="/budgets"
          label="Budgets & goals"
          hint="Monthly limits, rollover, savings"
          value={counts.goals}
        />
        <Row
          label="Contacts"
          hint="Added as you record loans"
          value={counts.contacts}
          chevron={false}
        />
      </RowGroup>

      <p className="label mt-1">Security</p>
      <RowGroup>
        <Toggle
          label="PIN lock"
          hint="Asked for whenever Ledger is opened"
          checked={prefs.lockEnabled}
          onChange={(on) => setAsking(on ? 'set' : 'remove')}
        />
        <Toggle
          label="Fingerprint / Face unlock"
          hint={
            !canUseBiometrics
              ? 'This device has nothing to check'
              : prefs.lockEnabled
                ? 'A faster way past the PIN, not a replacement'
                : 'Turn the PIN lock on first'
          }
          checked={prefs.biometricUnlock}
          disabled={!canUseBiometrics || !prefs.lockEnabled}
          onChange={(on) => void setBiometrics(on)}
        />
        {prefs.lockEnabled && (
          <Row
            label="Auto-lock"
            value={autoLockLabel(prefs.autoLock)}
            onClick={() => setPicking('autoLock')}
          />
        )}
        <Toggle
          label="Hide amounts on open"
          hint="Tap the eye on Home to reveal"
          checked={prefs.hideAmountsOnOpen}
          onChange={(on) => void savePreference('hideAmountsOnOpen', on)}
        />
        {prefs.lockEnabled && (
          <Row label="Lock now" onClick={() => useLockStore.getState().lock()} />
        )}
      </RowGroup>
      <p className="px-1 text-meta text-muted">
        The lock hides Ledger on this device. It does not encrypt what is
        stored — that is what a password on a backup file is for.
      </p>

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
        <Toggle
          label="Push to this device"
          hint={PUSH_HINT[push]}
          checked={push === 'on'}
          disabled={push !== 'on' && !canEnablePush(push)}
          onChange={(on) => void togglePush(on)}
        />
      </RowGroup>
      <p className="px-1 text-meta text-muted">
        Without push, Ledger can only check what is due when you
        open it. Reminders are raised then, at most once a day. Push
        reaches this device with Ledger closed, but not while it is
        offline — nothing can.
      </p>

      <p className="label mt-1">Data</p>
      <RowGroup>
        <Toggle
          label="Cloud copy"
          hint={SYNC_HINT[sync.state]}
          checked={sync.enabled}
          disabled={sync.state === 'unconfigured'}
          onChange={(on) => void toggleSync(on)}
        />
        {sync.enabled && (
          <Row label="Waiting to upload" value={queuedLabel(sync.queued)} chevron={false} />
        )}
        <Row
          to="/settings/backup"
          label="Backup & export"
          value={view.backupLabel}
          alert={view.backupOverdue}
        />
        <Row label="App version" value={view.version} chevron={false} />
      </RowGroup>
      <p className="px-1 text-meta text-muted">
        The copy goes up as soon as there is a network, and waits on this
        device until there is one. Receipt images and this device's own
        settings — your PIN among them — stay here.
      </p>

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
        open={picking === 'autoLock'}
        onClose={() => setPicking(null)}
        title="Auto-lock"
      >
        <p className="text-meta text-muted">
          How long Ledger can sit in the background before it asks again.
          Closing it and opening it afresh always asks.
        </p>
        <RowGroup role="radiogroup" aria-label="Auto-lock after">
          {AUTO_LOCKS.map((option) => (
            <ChoiceRow
              key={option.value}
              label={option.label}
              selected={option.value === prefs.autoLock}
              onSelect={() => {
                void savePreference('autoLock', option.value)
                setPicking(null)
              }}
            />
          ))}
        </RowGroup>
      </Sheet>

      {asking === 'set' && (
        <PinSheet
          onClose={() => setAsking(null)}
          title="Set a PIN"
          hint="Ledger will ask for this whenever it is opened."
          action="Turn the lock on"
          choosing
          onSubmit={async (pin) => {
            await setPin(pin)
            showSnack({ message: 'PIN lock on' })
          }}
        />
      )}

      {asking === 'remove' && (
        <PinSheet
          onClose={() => setAsking(null)}
          title="Turn the lock off"
          hint="Enter your current PIN. Fingerprint unlock goes with it."
          action="Turn the lock off"
          onSubmit={async (pin) => {
            if (!(await removePin(pin))) throw new Error('That is not the PIN')
            showSnack({ message: 'PIN lock off' })
          }}
        />
      )}

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
        <RowGroup role="radiogroup" aria-label="Currency">
          {CURRENCIES.map((currency) => (
            <ChoiceRow
              key={currency.code}
              label={currencyLabel(currency.code)}
              hint={currency.name}
              selected={currency.code === prefs.currency}
              onSelect={() => {
                void savePreference('currency', currency.code)
                setPicking(null)
              }}
            />
          ))}
        </RowGroup>
      </Sheet>
    </Screen>
  )
}
