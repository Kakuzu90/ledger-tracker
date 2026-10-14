/**
 * The lock's reads and writes.
 *
 * The PIN hash, the failed-attempt count and the cooldown all live in the
 * `settings` table rather than in memory: a lockout you could get past by
 * pulling down to refresh would not be one.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { getSetting, setSetting } from '@/db/settings'
import {
  cooldownFor,
  hashPin,
  secondsLeft,
  shouldLock,
  verifyPin,
  type PinRecord,
} from '@/lib/pin'
import { readPreferences } from '@/lib/preferences'
import {
  registerBiometric,
  verifyBiometric,
  type BiometricCredential,
} from '@/lib/webauthn'
import { useLockStore } from '@/store/lock'
import { useUIStore } from '@/store/ui'

const PIN_KEY = 'pin'
const CREDENTIAL_KEY = 'biometricCredential'
const FAILURES_KEY = 'lockFailures'
const COOLDOWN_KEY = 'lockCooldownUntil'
const ACTIVE_KEY = 'lastActiveAt'

export interface LockState {
  enabled: boolean
  hasPin: boolean
  biometrics: boolean
  credential?: BiometricCredential
  failures: number
  /** When another try will be accepted, if a cooldown is running. */
  cooldownUntil?: string
}

/** What the lock screen reads. Live, so a cooldown write re-renders it. */
export function useLockState(): LockState | undefined {
  return useLiveQuery(async () => {
    const settings = await db.settings.toArray()
    const value = <T>(key: string): T | undefined =>
      settings.find((row) => row.key === key)?.value as T | undefined

    const preferences = readPreferences(settings)
    const credential = value<BiometricCredential>(CREDENTIAL_KEY)

    return {
      enabled: preferences.lockEnabled,
      hasPin: value<PinRecord>(PIN_KEY) !== undefined,
      biometrics: preferences.biometricUnlock && credential !== undefined,
      ...(credential ? { credential } : {}),
      failures: value<number>(FAILURES_KEY) ?? 0,
      ...(value<string>(COOLDOWN_KEY) ? { cooldownUntil: value<string>(COOLDOWN_KEY) } : {}),
    }
  }, [])
}

/**
 * Whether to come up locked, read once at launch before anything is drawn.
 *
 * A launch always locks when the lock is on, whatever the auto-lock
 * interval says: the app was not away for a while, it was closed. The
 * interval governs coming back from the background (`shouldLockOnReturn`).
 */
export async function resolveLockOnLaunch(): Promise<boolean> {
  const settings = await db.settings.toArray()
  const pin = settings.find((row) => row.key === PIN_KEY)?.value as PinRecord | undefined
  return readPreferences(settings).lockEnabled && pin !== undefined
}

/** Records that the app is being left, which is what auto-lock measures from. */
export async function markAway(now: Date = new Date()): Promise<void> {
  await setSetting(ACTIVE_KEY, now.toISOString())
}

/**
 * Whether coming back from the background should lock. Reads the stored
 * moment rather than a timer, so a phone asleep for an hour is treated the
 * same as a tab left in the background for one.
 */
export async function shouldLockOnReturn(now: Date = new Date()): Promise<boolean> {
  const settings = await db.settings.toArray()
  const preferences = readPreferences(settings)
  const pin = settings.find((row) => row.key === PIN_KEY)?.value as PinRecord | undefined

  if (!preferences.lockEnabled || pin === undefined) return false
  const lastActive = settings.find((row) => row.key === ACTIVE_KEY)?.value
  return shouldLock(
    preferences.autoLock,
    typeof lastActive === 'string' ? lastActive : undefined,
    now,
  )
}

/** Opens the app, and re-applies "hide amounts on open" — this is an open. */
export async function openApp(): Promise<void> {
  const preferences = readPreferences(await db.settings.toArray())
  useUIStore.getState().setAmountsHidden(preferences.hideAmountsOnOpen)
  useLockStore.getState().open()
}

export interface UnlockResult {
  ok: boolean
  /** Seconds to wait, when the guesses have run out. */
  cooldown: number
  problem?: string
}

/**
 * Checks a PIN. A wrong one costs an attempt; a right one clears the slate
 * and opens the app.
 */
export async function tryPin(pin: string, now: Date = new Date()): Promise<UnlockResult> {
  const waiting = secondsLeft(await getSetting<string | undefined>(COOLDOWN_KEY, undefined), now)
  if (waiting > 0) return { ok: false, cooldown: waiting }

  const record = await getSetting<PinRecord | undefined>(PIN_KEY, undefined)
  if (record === undefined) {
    // No PIN to check against: opening is the only sane answer, since the
    // alternative is a lock nobody can ever get past.
    await openApp()
    return { ok: true, cooldown: 0 }
  }

  if (await verifyPin(pin, record)) {
    await clearFailures()
    await openApp()
    return { ok: true, cooldown: 0 }
  }

  const failures = (await getSetting(FAILURES_KEY, 0)) + 1
  const cooldown = cooldownFor(failures)

  await setSetting(FAILURES_KEY, failures)
  if (cooldown > 0) {
    await setSetting(COOLDOWN_KEY, new Date(now.getTime() + cooldown * 1000).toISOString())
  }

  return { ok: false, cooldown, problem: 'That is not the PIN' }
}

/** The fingerprint or face route past the lock. */
export async function tryBiometric(
  credential: BiometricCredential,
): Promise<UnlockResult> {
  const waiting = secondsLeft(await getSetting<string | undefined>(COOLDOWN_KEY, undefined))
  if (waiting > 0) return { ok: false, cooldown: waiting }

  if (!(await verifyBiometric(credential))) {
    // Not counted as a failed attempt: a sensor that did not read a finger
    // is not someone guessing, and the PIN has its own count.
    return { ok: false, cooldown: 0, problem: 'That did not match — use your PIN' }
  }

  await clearFailures()
  await openApp()
  return { ok: true, cooldown: 0 }
}

async function clearFailures(): Promise<void> {
  await db.settings.bulkDelete([FAILURES_KEY, COOLDOWN_KEY])
}

// ---- setting it up ------------------------------------------------------

export async function setPin(pin: string): Promise<void> {
  await setSetting(PIN_KEY, await hashPin(pin))
  await setSetting('lockEnabled', true)
  await clearFailures()
}

/**
 * Turns the lock off. The current PIN is required: an unlocked phone left on
 * a desk should not be one tap away from removing the lock on it.
 */
export async function removePin(pin: string): Promise<boolean> {
  const record = await getSetting<PinRecord | undefined>(PIN_KEY, undefined)
  if (record && !(await verifyPin(pin, record))) return false

  await db.settings.bulkDelete([PIN_KEY, CREDENTIAL_KEY])
  await setSetting('lockEnabled', false)
  await setSetting('biometricUnlock', false)
  await clearFailures()
  return true
}

export async function enableBiometrics(userName: string): Promise<void> {
  const credential = await registerBiometric(userName)
  await setSetting(CREDENTIAL_KEY, credential)
  await setSetting('biometricUnlock', true)
}

export async function disableBiometrics(): Promise<void> {
  await db.settings.delete(CREDENTIAL_KEY)
  await setSetting('biometricUnlock', false)
}
