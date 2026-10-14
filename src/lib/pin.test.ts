import { describe, expect, it } from 'vitest'
import {
  autoLockLabel,
  autoLockSeconds,
  AUTO_LOCKS,
  checkPin,
  cooldownFor,
  cooldownText,
  FREE_ATTEMPTS,
  hashPin,
  PIN_ITERATIONS,
  secondsLeft,
  shouldLock,
  verifyPin,
} from './pin'

describe('checkPin', () => {
  it('accepts an ordinary PIN', () => {
    expect(checkPin('2846')).toBeNull()
    expect(checkPin('19473628')).toBeNull()
  })

  it('wants digits', () => {
    expect(checkPin('12a4')).toBe('A PIN is digits only')
    expect(checkPin('')).toBe('A PIN is digits only')
    expect(checkPin('12 4')).toBe('A PIN is digits only')
  })

  it('wants four of them, and not more than eight', () => {
    expect(checkPin('284')).toBe('At least 4 digits')
    expect(checkPin('123456789')).toBe('At most 8 digits')
  })

  it('refuses the same digit over and over', () => {
    expect(checkPin('0000')).toBe('Pick something less guessable than the same digit')
    expect(checkPin('777777')).toBe('Pick something less guessable than the same digit')
  })

  it('refuses a straight run, up or down', () => {
    // A lock that opens to 1234 is decoration.
    expect(checkPin('1234')).toBe('Pick something less guessable than 1234')
    expect(checkPin('9876')).toBe('Pick something less guessable than 9876')
    expect(checkPin('456789')).toBe('Pick something less guessable than 456789')
  })

  it('lets a near-run through — the rule is for the obvious ones', () => {
    expect(checkPin('1235')).toBeNull()
    expect(checkPin('1243')).toBeNull()
  })
})

describe('hashPin and verifyPin', () => {
  it('accepts the right PIN', async () => {
    const record = await hashPin('2846')
    expect(await verifyPin('2846', record)).toBe(true)
  }, 20_000)

  it('rejects a wrong one', async () => {
    const record = await hashPin('2846')
    expect(await verifyPin('2847', record)).toBe(false)
    expect(await verifyPin('28460', record)).toBe(false)
    expect(await verifyPin('', record)).toBe(false)
  }, 20_000)

  it('never stores the PIN itself', async () => {
    const record = await hashPin('2846')
    expect(JSON.stringify(record)).not.toContain('2846')
    expect(record.iterations).toBe(PIN_ITERATIONS)
  }, 20_000)

  it('salts each one, so two people with the same PIN do not match', async () => {
    const a = await hashPin('2846')
    const b = await hashPin('2846')
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  }, 20_000)

  it('will not hash a PIN it would not accept', async () => {
    await expect(hashPin('1234')).rejects.toThrow('less guessable')
  })
})

describe('cooldownFor', () => {
  it('lets the first few slips go', () => {
    for (let failures = 0; failures <= FREE_ATTEMPTS; failures++) {
      expect(cooldownFor(failures), `${failures} failures`).toBe(0)
    }
  })

  it('makes the waits longer the further someone gets', () => {
    expect(cooldownFor(5)).toBe(30)
    expect(cooldownFor(6)).toBe(60)
    expect(cooldownFor(7)).toBe(300)
    expect(cooldownFor(8)).toBe(900)
  })

  it('holds at the longest wait rather than running away', () => {
    expect(cooldownFor(40)).toBe(900)
  })
})

describe('cooldownText', () => {
  it.each([
    [0, ''],
    [1, 'Try again in 1 second'],
    [30, 'Try again in 30 seconds'],
    [60, 'Try again in 1 minute'],
    [300, 'Try again in 5 minutes'],
    [61, 'Try again in 2 minutes'],
  ])('reads %i seconds as "%s"', (seconds, expected) => {
    expect(cooldownText(seconds)).toBe(expected)
  })
})

describe('secondsLeft', () => {
  const now = new Date('2026-10-14T09:00:00.000Z')

  it('counts down to the moment given', () => {
    expect(secondsLeft('2026-10-14T09:00:30.000Z', now)).toBe(30)
  })

  it('is nothing once it has passed', () => {
    expect(secondsLeft('2026-10-14T08:59:00.000Z', now)).toBe(0)
  })

  it('is nothing when there is no cooldown at all', () => {
    expect(secondsLeft(undefined, now)).toBe(0)
    expect(secondsLeft('not a date', now)).toBe(0)
  })
})

describe('autoLockSeconds', () => {
  it('maps each choice', () => {
    expect(autoLockSeconds('immediately')).toBe(0)
    expect(autoLockSeconds('1m')).toBe(60)
    expect(autoLockSeconds('15m')).toBe(900)
    expect(autoLockSeconds('never')).toBeNull()
  })

  it('names them all', () => {
    for (const { value, label } of AUTO_LOCKS) {
      expect(autoLockLabel(value)).toBe(label)
    }
  })
})

describe('shouldLock', () => {
  const now = new Date('2026-10-14T09:05:00.000Z')
  const awayFor = (seconds: number) =>
    new Date(now.getTime() - seconds * 1000).toISOString()

  it('locks as soon as you look away, when that is the setting', () => {
    expect(shouldLock('immediately', awayFor(0), now)).toBe(true)
  })

  it('waits out the interval first', () => {
    expect(shouldLock('5m', awayFor(60), now)).toBe(false)
    expect(shouldLock('5m', awayFor(299), now)).toBe(false)
    expect(shouldLock('5m', awayFor(300), now)).toBe(true)
  })

  it('stays open when the user asked it to', () => {
    expect(shouldLock('never', awayFor(100_000), now)).toBe(false)
  })

  it('locks a cold start whatever the setting says', () => {
    // The app was not away, it was gone.
    expect(shouldLock('never', awayFor(1), now, true)).toBe(true)
  })

  it('locks when there is no evidence either way', () => {
    // A crash or a hard reload leaves no timestamp behind.
    expect(shouldLock('5m', undefined, now)).toBe(true)
    expect(shouldLock('5m', 'not a date', now)).toBe(true)
  })
})
