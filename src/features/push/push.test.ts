import { describe, expect, it } from 'vitest'
import { canEnablePush, describeDevice, PUSH_HINT, PUSH_TTL_SECONDS, type PushState } from './push'

describe('canEnablePush', () => {
  it('only lets the states that can be turned on be turned on', () => {
    expect(canEnablePush('off')).toBe(true)
    // A failed attempt is the one error the user can do something about,
    // so the switch has to stay live rather than strand them.
    expect(canEnablePush('failed')).toBe(true)
    for (const blocked of ['on', 'unconfigured', 'no-vapid-key', 'unsupported', 'denied'] as const) {
      expect(canEnablePush(blocked)).toBe(false)
    }
  })
})

describe('PUSH_HINT', () => {
  const states: PushState[] = [
    'on',
    'off',
    'failed',
    'unconfigured',
    'no-vapid-key',
    'unsupported',
    'denied',
  ]

  it('says something for every state, so the row is never blank', () => {
    for (const state of states) {
      expect(PUSH_HINT[state]).toBeTruthy()
    }
  })

  it('keeps "cannot" and "not yet" apart', () => {
    // These look the same on screen as a greyed-out switch, and mean
    // very different things to someone trying to turn it on.
    expect(new Set(states.map((s) => PUSH_HINT[s])).size).toBe(states.length)
  })
})

describe('describeDevice', () => {
  const cases: ReadonlyArray<[string, string]> = [
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Safari on iOS',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Chrome on Android',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Chrome on macOS',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      'Edge on Windows',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Firefox on macOS',
    ],
  ]

  it.each(cases)('reads %# as the browser and OS a person would name', (ua, expected) => {
    expect(describeDevice(ua)).toBe(expected)
  })

  it('does not call Edge or Chrome "Safari", though both claim it', () => {
    const edge = cases[3]![0]
    const chrome = cases[2]![0]
    expect(describeDevice(edge)).not.toContain('Safari')
    expect(describeDevice(chrome)).not.toContain('Safari')
  })

  it('falls back rather than throwing on something unrecognised', () => {
    expect(describeDevice('')).toBe('Browser on Unknown')
    expect(describeDevice('curl/8.4.0')).toBe('Browser on Unknown')
  })
})

describe('PUSH_TTL_SECONDS', () => {
  it('is a day — long enough to outlast a night, short enough to stay true', () => {
    expect(PUSH_TTL_SECONDS).toBe(86_400)
    // FCM would otherwise hold a message for four weeks and deliver a
    // "due tomorrow" long after the bill was due.
    expect(PUSH_TTL_SECONDS).toBeLessThan(4 * 7 * 24 * 60 * 60)
  })
})
