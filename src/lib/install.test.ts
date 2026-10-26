import { describe, expect, it } from 'vitest'
import {
  dismissalExpired,
  installOffer,
  isAppleMobile,
  type BeforeInstallPromptEvent,
} from './install'

const now = new Date('2026-10-26T09:00:00.000Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()

/** Only its presence matters to `installOffer`. */
const prompt = {} as BeforeInstallPromptEvent

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
const IPAD =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'

describe('dismissalExpired', () => {
  it('treats a banner that was never dismissed as showable', () => {
    expect(dismissalExpired(undefined, now)).toBe(true)
  })

  it('keeps it hidden for a dismissal from yesterday', () => {
    expect(dismissalExpired(daysAgo(1), now)).toBe(false)
  })

  it('lets it back after thirty days — one tap must not silence it forever', () => {
    expect(dismissalExpired(daysAgo(29), now)).toBe(false)
    expect(dismissalExpired(daysAgo(30), now)).toBe(true)
  })

  it('ignores a timestamp it cannot read', () => {
    expect(dismissalExpired('not a date', now)).toBe(true)
  })
})

describe('isAppleMobile', () => {
  it('knows an iPhone', () => {
    expect(isAppleMobile(IPHONE, 5)).toBe(true)
  })

  it('knows an iPad, which claims to be a Mac', () => {
    expect(isAppleMobile(IPAD, 5)).toBe(true)
  })

  it('does not mistake a real Mac for one', () => {
    expect(isAppleMobile(IPAD, 0)).toBe(false)
  })

  it('leaves Android alone', () => {
    expect(isAppleMobile(ANDROID, 5)).toBe(false)
  })
})

describe('installOffer', () => {
  const base = { event: null, apple: false, installed: false, dismissedAt: undefined, now }

  it('offers the browser prompt when one has been captured', () => {
    expect(installOffer({ ...base, event: prompt })).toBe('prompt')
  })

  it('offers instructions on iOS, where no prompt will ever arrive', () => {
    expect(installOffer({ ...base, apple: true })).toBe('ios')
  })

  it('offers nothing where neither applies — desktop Safari, Firefox', () => {
    expect(installOffer(base)).toBe('none')
  })

  it('offers nothing once the app is installed', () => {
    expect(installOffer({ ...base, event: prompt, installed: true })).toBe('none')
    expect(installOffer({ ...base, apple: true, installed: true })).toBe('none')
  })

  it('stays quiet for a recent dismissal and returns after it ages out', () => {
    expect(installOffer({ ...base, apple: true, dismissedAt: daysAgo(2) })).toBe('none')
    expect(installOffer({ ...base, apple: true, dismissedAt: daysAgo(90) })).toBe('ios')
  })

  it('prefers the real prompt over instructions', () => {
    expect(installOffer({ ...base, event: prompt, apple: true })).toBe('prompt')
  })
})
