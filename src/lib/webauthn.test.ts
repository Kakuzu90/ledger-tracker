import { afterEach, describe, expect, it, vi } from 'vitest'
import { bytesToBase64Url } from './bytes'
import {
  biometricsAvailable,
  biometricsSupported,
  describeError,
  registerBiometric,
  userVerified,
  verifyBiometric,
  type BiometricCredential,
} from './webauthn'

/** Authenticator data: 32 bytes of rp id hash, then the flags byte. */
const authData = (flags: number): Uint8Array => {
  const bytes = new Uint8Array(37)
  bytes[32] = flags
  return bytes
}

const RAW_ID = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8])
const credential: BiometricCredential = {
  id: bytesToBase64Url(RAW_ID),
  createdAt: '2026-10-14T09:00:00.000Z',
}

const withWebAuthn = (overrides: {
  create?: unknown
  get?: unknown
  available?: boolean
}) => {
  const PublicKeyCredential = function () {} as unknown as typeof window.PublicKeyCredential
  PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = () =>
    overrides.available === undefined
      ? Promise.resolve(true)
      : Promise.resolve(overrides.available)

  vi.stubGlobal('PublicKeyCredential', PublicKeyCredential)
  vi.stubGlobal('navigator', {
    ...navigator,
    credentials: {
      create: vi.fn(() => Promise.resolve(overrides.create ?? null)),
      get: vi.fn(() => Promise.resolve(overrides.get ?? null)),
    },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('userVerified', () => {
  it('reads the user-verified flag', () => {
    // 0x05 = user present (0x01) and user verified (0x04).
    expect(userVerified(authData(0x05))).toBe(true)
  })

  it('is false when only presence was proved', () => {
    // A button press, not a fingerprint — which is not what unlocks this.
    expect(userVerified(authData(0x01))).toBe(false)
  })

  it('is false for data too short to carry flags at all', () => {
    expect(userVerified(new Uint8Array(10))).toBe(false)
  })
})

describe('describeError', () => {
  const named = (name: string) => Object.assign(new Error('raw'), { name })

  it.each([
    ['NotAllowedError', 'That was cancelled, or it timed out'],
    ['InvalidStateError', 'This device is already set up'],
    ['NotSupportedError', 'This device cannot do that'],
    ['SecurityError', 'The browser refused — this needs a secure page'],
  ])('turns %s into something a reader can act on', (name, expected) => {
    expect(describeError(named(name))).toBe(expected)
  })

  it('falls back to the message, then to a plain sentence', () => {
    expect(describeError(new Error('the sensor is busy'))).toBe('the sensor is busy')
    expect(describeError('something odd')).toBe('That did not work')
  })
})

describe('support detection', () => {
  it('is false in a browser with no WebAuthn at all', () => {
    expect(biometricsSupported()).toBe(false)
  })

  it('is true once the API is there', () => {
    withWebAuthn({})
    expect(biometricsSupported()).toBe(true)
  })

  it('asks whether the device itself can verify its owner', async () => {
    withWebAuthn({ available: false })
    expect(await biometricsAvailable()).toBe(false)

    withWebAuthn({ available: true })
    expect(await biometricsAvailable()).toBe(true)
  })

  it('takes a thrown probe as a no', async () => {
    const PublicKeyCredential = function () {} as unknown as typeof window.PublicKeyCredential
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = () => {
      throw new Error('nope')
    }
    vi.stubGlobal('PublicKeyCredential', PublicKeyCredential)
    vi.stubGlobal('navigator', { ...navigator, credentials: { create: vi.fn() } })

    expect(await biometricsAvailable()).toBe(false)
  })
})

describe('registerBiometric', () => {
  it('keeps the credential id and nothing else', async () => {
    withWebAuthn({ create: { rawId: RAW_ID.buffer } })
    const made = await registerBiometric('Alex')

    expect(made.id).toBe(credential.id)
    expect(made.createdAt).toMatch(/^\d{4}-/)
  })

  it('refuses when the browser has no WebAuthn', async () => {
    await expect(registerBiometric('Alex')).rejects.toThrow('cannot do that')
  })

  it('refuses when the device set nothing up', async () => {
    withWebAuthn({ create: null })
    await expect(registerBiometric('Alex')).rejects.toThrow('did not set anything up')
  })
})

describe('verifyBiometric', () => {
  it('opens when the right credential says the person was verified', async () => {
    withWebAuthn({
      get: { rawId: RAW_ID.buffer, response: { authenticatorData: authData(0x05).buffer } },
    })
    expect(await verifyBiometric(credential)).toBe(true)
  })

  it('refuses when only presence was proved', async () => {
    withWebAuthn({
      get: { rawId: RAW_ID.buffer, response: { authenticatorData: authData(0x01).buffer } },
    })
    expect(await verifyBiometric(credential)).toBe(false)
  })

  it('refuses a different credential, however it got there', async () => {
    withWebAuthn({
      get: {
        rawId: Uint8Array.from([9, 9, 9, 9]).buffer,
        response: { authenticatorData: authData(0x05).buffer },
      },
    })
    expect(await verifyBiometric(credential)).toBe(false)
  })

  it('refuses when nothing answered', async () => {
    withWebAuthn({ get: null })
    expect(await verifyBiometric(credential)).toBe(false)
  })

  it('refuses outright in a browser with no WebAuthn', async () => {
    expect(await verifyBiometric(credential)).toBe(false)
  })
})
