/**
 * Fingerprint / Face unlock, through WebAuthn's platform authenticator.
 *
 * What this is, precisely: the device is asked to verify its owner, and the
 * app opens if it says yes. The credential's signature is *not* checked
 * against a server, because there is no server — so this is not proof to a
 * remote party that anyone authenticated. It is a local gate: the biometric
 * prompt is the operating system's, it cannot be dismissed into a "yes", and
 * the assertion only comes back for the exact credential this app registered
 * on this device and origin.
 *
 * Two things are checked rather than assumed. The credential that answers
 * has to be the one that was registered — another passkey on the device will
 * not do. And the authenticator has to set the user-verified flag, which is
 * what separates "a finger was placed on the sensor" from "a button was
 * pressed". Without that check, `userVerification: 'required'` would be a
 * request the authenticator is free to ignore.
 *
 * The PIN stays the way in regardless: biometrics can fail for ordinary
 * reasons — a wet thumb, a mask, a sensor that has had enough — and being
 * locked out of your own ledger is worse than typing four digits.
 */

import { base64UrlToBytes, bytesToBase64Url } from './bytes'

export interface BiometricCredential {
  /** base64url, as WebAuthn ids travel. */
  id: string
  createdAt: string
}

/** The user-verified bit in the authenticator data flags byte. */
const UV_FLAG = 0x04

export function biometricsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential === 'function' &&
    typeof navigator.credentials?.create === 'function'
  )
}

/**
 * Whether this device has a built-in authenticator that can verify its
 * owner — Touch ID, Face ID, Windows Hello, a phone's fingerprint reader.
 * A security key on a USB port is not what this screen is offering.
 */
export async function biometricsAvailable(): Promise<boolean> {
  if (!biometricsSupported()) return false
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

/** Flags live at byte 32, after the 32-byte relying-party id hash. */
export function userVerified(authenticatorData: Uint8Array): boolean {
  const flags = authenticatorData[32]
  return flags !== undefined && (flags & UV_FLAG) !== 0
}

/** The sentence to show when a ceremony does not finish. */
export function describeError(error: unknown): string {
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError') return 'That was cancelled, or it timed out'
  if (name === 'InvalidStateError') return 'This device is already set up'
  if (name === 'NotSupportedError') return 'This device cannot do that'
  if (name === 'SecurityError') return 'The browser refused — this needs a secure page'
  return error instanceof Error && error.message ? error.message : 'That did not work'
}

const challenge = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32))

/**
 * Enrols this device. The credential never leaves it, and all the app keeps
 * is the id it has to ask for next time.
 */
export async function registerBiometric(
  userName: string,
): Promise<BiometricCredential> {
  if (!biometricsSupported()) throw new Error('This browser cannot do that')

  const created = (await navigator.credentials.create({
    publicKey: {
      // No `rp.id`: it defaults to this origin, which is the only place the
      // credential should ever work.
      rp: { name: 'Ledger' },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: userName || 'Ledger',
        displayName: userName || 'Ledger',
      },
      challenge: challenge() as BufferSource,
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      // Nothing verifies an attestation statement here, so asking for one
      // would only be a privacy cost to the user.
      attestation: 'none',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null

  if (!created) throw new Error('This device did not set anything up')

  return {
    id: bytesToBase64Url(new Uint8Array(created.rawId)),
    createdAt: new Date().toISOString(),
  }
}

/**
 * Asks the device to verify its owner. True only when the credential that
 * answers is the registered one *and* the authenticator says it verified
 * the person, not merely that someone was present.
 */
export async function verifyBiometric(
  credential: BiometricCredential,
): Promise<boolean> {
  if (!biometricsSupported()) return false

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: challenge() as BufferSource,
      allowCredentials: [
        { type: 'public-key', id: base64UrlToBytes(credential.id) as BufferSource },
      ],
      userVerification: 'required',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null

  if (!assertion) return false
  if (bytesToBase64Url(new Uint8Array(assertion.rawId)) !== credential.id) return false

  const response = assertion.response as AuthenticatorAssertionResponse
  return userVerified(new Uint8Array(response.authenticatorData))
}
