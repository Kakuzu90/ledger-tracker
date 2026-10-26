/**
 * Deciding whether to offer an install, and which kind.
 *
 * Two browsers, two different stories. Chromium fires
 * `beforeinstallprompt` and lets a button do the work; WebKit has never
 * implemented it and has said it will not, so on iPhone and iPad the
 * only route is Share → Add to Home Screen and the best the app can do
 * is say so. Everywhere else — desktop Safari, Firefox — there is
 * nothing worth showing, so nothing is shown.
 */

/** Chromium's install prompt event, which TypeScript's DOM lib does not have. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** What the home screen should offer, if anything. */
export type InstallOffer = 'none' | 'prompt' | 'ios'

/**
 * How long a dismissal lasts. Long enough not to nag, short enough that
 * one tap months ago does not silence the banner for good — which it
 * did, since nothing ever cleared the stored timestamp.
 */
export const DISMISS_DAYS = 30

const DAY_MS = 86_400_000

/** Whether a stored dismissal has aged out and the banner may return. */
export function dismissalExpired(at: string | undefined, now: Date): boolean {
  if (!at) return true
  const when = Date.parse(at)
  // An unreadable timestamp should not silence the banner forever.
  if (Number.isNaN(when)) return true
  return now.getTime() - when >= DISMISS_DAYS * DAY_MS
}

/**
 * Whether this is an iPhone or iPad. iPadOS 13 and later claim to be a
 * Macintosh, and the touch points are the only thing that gives them
 * away — a real Mac reports 0.
 */
export function isAppleMobile(ua: string, maxTouchPoints: number): boolean {
  if (/iphone|ipad|ipod/i.test(ua)) return true
  return /macintosh/i.test(ua) && maxTouchPoints > 1
}

export interface OfferInput {
  /** A captured `beforeinstallprompt`, if one has arrived. */
  event: BeforeInstallPromptEvent | null
  apple: boolean
  /** Already running from the home screen — there is nothing to install. */
  installed: boolean
  dismissedAt: string | undefined
  now: Date
}

export function installOffer({
  event,
  apple,
  installed,
  dismissedAt,
  now,
}: OfferInput): InstallOffer {
  if (installed) return 'none'
  if (!dismissalExpired(dismissedAt, now)) return 'none'
  // Chromium's own prompt beats instructions, including on an Android
  // tablet that happens to match neither test.
  if (event) return 'prompt'
  return apple ? 'ios' : 'none'
}

/* The browser-facing half. Everything above is pure and tested; these
 * three only read what the environment says. */

declare global {
  interface Window {
    /** Stashed by the inline script in index.html. */
    __ledgerInstallEvent: BeforeInstallPromptEvent | null
  }
}

/** The event index.html caught before the bundle loaded, if there was one. */
export const stashedPrompt = (): BeforeInstallPromptEvent | null =>
  typeof window === 'undefined' ? null : (window.__ledgerInstallEvent ?? null)

export const clearStashedPrompt = (): void => {
  if (typeof window !== 'undefined') window.__ledgerInstallEvent = null
}

/** Already launched from the home screen, so there is nothing to offer. */
export function runningInstalled(): boolean {
  if (typeof window === 'undefined') return false
  // `standalone` is Safari's, and is the only signal iOS gives.
  const safari = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return safari || window.matchMedia('(display-mode: standalone)').matches
}

export const onApple = (): boolean =>
  typeof navigator !== 'undefined' && isAppleMobile(navigator.userAgent, navigator.maxTouchPoints)
