import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/db'
import { setSetting } from '@/db/settings'
import { bytesToBase64Url } from '@/lib/bytes'
import { useLockStore } from '@/store/lock'
import { useUIStore } from '@/store/ui'
import {
  disableBiometrics,
  enableBiometrics,
  markAway,
  openApp,
  removePin,
  resolveLockOnLaunch,
  setPin,
  shouldLockOnReturn,
  tryBiometric,
  tryPin,
} from './db'

const NOW = new Date('2026-10-14T09:05:00.000Z')
const awayFor = (seconds: number) =>
  new Date(NOW.getTime() - seconds * 1000).toISOString()

const RAW_ID = Uint8Array.from([1, 2, 3, 4])
const credential = { id: bytesToBase64Url(RAW_ID), createdAt: '2026-10-01T00:00:00.000Z' }

const withWebAuthn = (overrides: { create?: unknown; get?: unknown } = {}) => {
  const PublicKeyCredential = function () {} as unknown as typeof window.PublicKeyCredential
  PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = () =>
    Promise.resolve(true)
  vi.stubGlobal('PublicKeyCredential', PublicKeyCredential)
  vi.stubGlobal('navigator', {
    ...navigator,
    credentials: {
      create: vi.fn(() => Promise.resolve(overrides.create ?? null)),
      get: vi.fn(() => Promise.resolve(overrides.get ?? null)),
    },
  })
}

/** Authenticator data: 32 bytes of hash, then the flags byte. */
const authData = (flags: number) => {
  const bytes = new Uint8Array(37)
  bytes[32] = flags
  return bytes.buffer
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
  useLockStore.setState({ status: 'unknown' })
  useUIStore.setState({ amountsHidden: false })
})

afterEach(() => vi.unstubAllGlobals())

describe('resolveLockOnLaunch', () => {
  it('does not lock an app with no lock on it', async () => {
    expect(await resolveLockOnLaunch()).toBe(false)
  })

  it('does not lock when the switch is on but no PIN was ever set', async () => {
    // Belt and braces: a lock nobody can get past is worse than none.
    await setSetting('lockEnabled', true)
    expect(await resolveLockOnLaunch()).toBe(false)
  })

  it('locks once there is a PIN behind the switch', async () => {
    await setPin('2846')
    expect(await resolveLockOnLaunch()).toBe(true)
  }, 20_000)

  it('locks a launch even when auto-lock says never', async () => {
    // "Only when I reopen" — and this is reopening.
    await setPin('2846')
    await setSetting('autoLock', 'never')
    expect(await resolveLockOnLaunch()).toBe(true)
  }, 20_000)
})

describe('shouldLockOnReturn', () => {
  beforeEach(async () => {
    await setPin('2846')
  }, 20_000)

  it('leaves it open for a glance away', async () => {
    await setSetting('autoLock', '5m')
    await setSetting('lastActiveAt', awayFor(30))
    expect(await shouldLockOnReturn(NOW)).toBe(false)
  })

  it('locks once the interval has passed', async () => {
    await setSetting('autoLock', '5m')
    await setSetting('lastActiveAt', awayFor(301))
    expect(await shouldLockOnReturn(NOW)).toBe(true)
  })

  it('stays open when the user said never', async () => {
    await setSetting('autoLock', 'never')
    await setSetting('lastActiveAt', awayFor(100_000))
    expect(await shouldLockOnReturn(NOW)).toBe(false)
  })

  it('does nothing at all when there is no lock', async () => {
    await removePin('2846')
    await setSetting('lastActiveAt', awayFor(100_000))
    expect(await shouldLockOnReturn(NOW)).toBe(false)
  }, 20_000)
})

describe('markAway', () => {
  it('records when the app was left', async () => {
    await markAway(NOW)
    expect(await db.settings.get('lastActiveAt')).toMatchObject({
      value: NOW.toISOString(),
    })
  })
})

describe('openApp', () => {
  it('opens, and re-hides amounts when that is the preference', async () => {
    await setSetting('hideAmountsOnOpen', true)
    await openApp()

    expect(useLockStore.getState().status).toBe('open')
    expect(useUIStore.getState().amountsHidden).toBe(true)
  })

  it('reveals them again when it is not', async () => {
    useUIStore.setState({ amountsHidden: true })
    await openApp()
    expect(useUIStore.getState().amountsHidden).toBe(false)
  })
})

describe('tryPin', () => {
  beforeEach(async () => {
    await setPin('2846')
  }, 20_000)

  it('opens on the right PIN', async () => {
    expect(await tryPin('2846')).toMatchObject({ ok: true })
    expect(useLockStore.getState().status).toBe('open')
  }, 20_000)

  it('refuses a wrong one and counts it', async () => {
    const result = await tryPin('2847')

    expect(result).toMatchObject({ ok: false, problem: 'That is not the PIN' })
    expect(useLockStore.getState().status).toBe('unknown')
    expect(await db.settings.get('lockFailures')).toMatchObject({ value: 1 })
  }, 20_000)

  it('clears the count on the way in', async () => {
    await tryPin('2847')
    await tryPin('2846')
    expect(await db.settings.get('lockFailures')).toBeUndefined()
  }, 30_000)

  it('starts making the guesser wait after five', async () => {
    await db.settings.put({ key: 'lockFailures', value: 4 })
    const result = await tryPin('2847', NOW)

    expect(result.cooldown).toBe(30)
    expect(await db.settings.get('lockCooldownUntil')).toMatchObject({
      value: new Date(NOW.getTime() + 30_000).toISOString(),
    })
  }, 20_000)

  it('refuses even the right PIN while the wait is running', async () => {
    await db.settings.put({
      key: 'lockCooldownUntil',
      value: new Date(NOW.getTime() + 20_000).toISOString(),
    })

    expect(await tryPin('2846', NOW)).toMatchObject({ ok: false, cooldown: 20 })
    expect(useLockStore.getState().status).toBe('unknown')
  }, 20_000)

  it('does not spend an attempt on a try it refused to check', async () => {
    await db.settings.put({ key: 'lockFailures', value: 5 })
    await db.settings.put({
      key: 'lockCooldownUntil',
      value: new Date(NOW.getTime() + 20_000).toISOString(),
    })

    await tryPin('0000', NOW)
    expect(await db.settings.get('lockFailures')).toMatchObject({ value: 5 })
  }, 20_000)

  it('lets anyone in when there is no PIN to check', async () => {
    await removePin('2846')
    expect(await tryPin('')).toMatchObject({ ok: true })
  }, 20_000)
})

describe('setPin and removePin', () => {
  it('turns the lock on with the PIN, stored as a hash', async () => {
    await setPin('2846')

    expect(await db.settings.get('lockEnabled')).toMatchObject({ value: true })
    expect(JSON.stringify(await db.settings.get('pin'))).not.toContain('2846')
  }, 20_000)

  it('refuses a PIN that is too easy to guess', async () => {
    await expect(setPin('1234')).rejects.toThrow('less guessable')
  })

  it('will not turn the lock off without the current PIN', async () => {
    await setPin('2846')

    expect(await removePin('9999')).toBe(false)
    expect(await db.settings.get('pin')).toBeDefined()
    expect(await db.settings.get('lockEnabled')).toMatchObject({ value: true })
  }, 30_000)

  it('takes the PIN, the credential and the switches with it', async () => {
    await setPin('2846')
    withWebAuthn({ create: { rawId: RAW_ID.buffer } })
    await enableBiometrics('Alex')

    expect(await removePin('2846')).toBe(true)
    expect(await db.settings.get('pin')).toBeUndefined()
    expect(await db.settings.get('biometricCredential')).toBeUndefined()
    expect(await db.settings.get('biometricUnlock')).toMatchObject({ value: false })
  }, 30_000)

  it('forgets a failed run of guesses once a new PIN is set', async () => {
    await db.settings.put({ key: 'lockFailures', value: 6 })
    await setPin('2846')
    expect(await db.settings.get('lockFailures')).toBeUndefined()
  }, 20_000)
})

describe('biometrics', () => {
  it('stores only the credential id', async () => {
    withWebAuthn({ create: { rawId: RAW_ID.buffer } })
    await enableBiometrics('Alex')

    expect(await db.settings.get('biometricCredential')).toMatchObject({
      value: { id: credential.id },
    })
    expect(await db.settings.get('biometricUnlock')).toMatchObject({ value: true })
  })

  it('opens the app when the device verifies its owner', async () => {
    withWebAuthn({ get: { rawId: RAW_ID.buffer, response: { authenticatorData: authData(0x05) } } })

    expect(await tryBiometric(credential)).toMatchObject({ ok: true })
    expect(useLockStore.getState().status).toBe('open')
  })

  it('does not count a failed read as a guess', async () => {
    // A wet thumb is not someone trying PINs, and the PIN has its own count.
    withWebAuthn({ get: null })

    expect(await tryBiometric(credential)).toMatchObject({ ok: false })
    expect(await db.settings.get('lockFailures')).toBeUndefined()
  })

  it('is refused while a PIN cooldown is running', async () => {
    withWebAuthn({ get: { rawId: RAW_ID.buffer, response: { authenticatorData: authData(0x05) } } })
    await db.settings.put({
      key: 'lockCooldownUntil',
      value: new Date(Date.now() + 20_000).toISOString(),
    })

    expect(await tryBiometric(credential)).toMatchObject({ ok: false })
    expect(useLockStore.getState().status).toBe('unknown')
  })

  it('forgets the credential when switched off', async () => {
    withWebAuthn({ create: { rawId: RAW_ID.buffer } })
    await enableBiometrics('Alex')
    await disableBiometrics()

    expect(await db.settings.get('biometricCredential')).toBeUndefined()
    expect(await db.settings.get('biometricUnlock')).toMatchObject({ value: false })
  })
})
