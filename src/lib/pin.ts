/**
 * The app lock's PIN: choosing one, storing it, checking it, and slowing
 * down someone who is guessing.
 *
 * What this is honest about: the PIN gates the *screen*, not the data. The
 * ledger sits in IndexedDB in the clear, so anyone with the unlocked device
 * and a devtools window can read it whatever this says. What the lock is
 * worth is the ordinary case — a phone handed over, a shoulder at a desk.
 * Encryption is what a backup file gets (see `src/lib/backup.ts`), because
 * there the data leaves the device.
 *
 * The PIN itself is never stored. What is stored is PBKDF2-SHA256 over it
 * with a random salt, so reading the database does not hand anyone the PIN
 * they could also be using elsewhere.
 */

import { base64ToBytes, bytesToBase64, equalBytes } from './bytes'

/**
 * Four digits, not a range.
 *
 * The lock screen is a row of dots over a keypad (design/Lock.dc.html) and
 * it submits the moment the last one fills — which only works if both ends
 * agree on how many there are. A PIN whose length the lock cannot know is a
 * PIN the lock cannot take.
 */
export const PIN_LENGTH = 4

/** Same work factor as the backup key: OWASP's 2023 floor for SHA-256. */
export const PIN_ITERATIONS = 210_000

export interface PinRecord {
  salt: string
  hash: string
  iterations: number
}

const DIGITS = /^\d+$/

/** A run of digits each one more, or one less, than the last. */
function isRun(pin: string): boolean {
  const steps = [...pin].slice(1).map((digit, i) => Number(digit) - Number(pin[i]))
  return steps.every((step) => step === 1) || steps.every((step) => step === -1)
}

/**
 * The sentence to show, or null when the PIN will do. Guessable PINs are
 * refused rather than warned about: a lock that opens to 1234 is decoration,
 * and 1234 is the first thing anyone tries.
 */
export function checkPin(pin: string): string | null {
  if (!DIGITS.test(pin)) return 'A PIN is digits only'
  if (pin.length !== PIN_LENGTH) return `A PIN is ${PIN_LENGTH} digits`
  if (new Set(pin).size === 1) return 'Pick something less guessable than the same digit'
  if (isRun(pin)) return `Pick something less guessable than ${pin}`
  return null
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )

  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, hash: 'SHA-256', iterations },
    material,
    256,
  )

  return bytesToBase64(new Uint8Array(bits))
}

export async function hashPin(pin: string): Promise<PinRecord> {
  const problem = checkPin(pin)
  if (problem) throw new Error(problem)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  return {
    salt: bytesToBase64(salt),
    hash: await derive(pin, salt, PIN_ITERATIONS),
    iterations: PIN_ITERATIONS,
  }
}

/** Constant-time against the stored hash; a wrong guess learns nothing. */
export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  if (!DIGITS.test(pin)) return false
  const hash = await derive(pin, base64ToBytes(record.salt), record.iterations)
  return equalBytes(base64ToBytes(hash), base64ToBytes(record.hash))
}

// ---- slowing down a guesser ---------------------------------------------

/** Wrong tries allowed before the keypad starts making you wait. */
export const FREE_ATTEMPTS = 4

/** Seconds to wait after the 5th, 6th, 7th and every later wrong try. */
const COOLDOWNS = [30, 60, 300, 900] as const

/**
 * How long to wait after `failures` wrong tries in a row.
 *
 * Four digits is ten thousand combinations, which a determined person with
 * the phone could walk through in an afternoon. The wait is what makes that
 * an afternoon of nothing rather than an afternoon.
 */
export function cooldownFor(failures: number): number {
  if (failures <= FREE_ATTEMPTS) return 0
  const step = failures - FREE_ATTEMPTS - 1
  return COOLDOWNS[Math.min(step, COOLDOWNS.length - 1)] as number
}

/** "Try again in 30 seconds", "Try again in 5 minutes". */
export function cooldownText(seconds: number): string {
  if (seconds <= 0) return ''
  if (seconds < 60) {
    return `Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
  }
  const minutes = Math.ceil(seconds / 60)
  return `Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

/** Seconds still to wait, given when the cooldown ends. 0 when it has. */
export function secondsLeft(until: string | undefined, now: Date = new Date()): number {
  if (until === undefined) return 0
  const left = Math.ceil((Date.parse(until) - now.getTime()) / 1000)
  return Number.isFinite(left) && left > 0 ? left : 0
}

// ---- auto-lock ----------------------------------------------------------

export type AutoLock = 'immediately' | '1m' | '5m' | '15m' | 'never'

export const AUTO_LOCKS: ReadonlyArray<{ value: AutoLock; label: string }> = [
  { value: 'immediately', label: 'Immediately' },
  { value: '1m', label: 'After 1 minute' },
  { value: '5m', label: 'After 5 minutes' },
  { value: '15m', label: 'After 15 minutes' },
  { value: 'never', label: 'Only when I reopen' },
]

export const autoLockLabel = (value: AutoLock): string =>
  AUTO_LOCKS.find((option) => option.value === value)?.label ?? 'After 1 minute'

/** Seconds of being away before the lock comes back; null when it does not. */
export function autoLockSeconds(value: AutoLock): number | null {
  if (value === 'never') return null
  if (value === 'immediately') return 0
  return { '1m': 60, '5m': 300, '15m': 900 }[value]
}

/**
 * Whether to lock on opening again, given when the app was last here.
 *
 * "Only when I reopen" still locks on a cold start: the app was not merely
 * away, it was gone, and `lastActiveAt` is the only evidence either way. A
 * missing timestamp means a reload or a crash, and that locks too — erring
 * towards the lock is the whole point of having one.
 */
export function shouldLock(
  value: AutoLock,
  lastActiveAt: string | undefined,
  now: Date = new Date(),
  coldStart = false,
): boolean {
  if (coldStart) return true
  const limit = autoLockSeconds(value)
  if (limit === null) return false
  if (lastActiveAt === undefined) return true

  const away = (now.getTime() - Date.parse(lastActiveAt)) / 1000
  if (!Number.isFinite(away)) return true
  return away >= limit
}
