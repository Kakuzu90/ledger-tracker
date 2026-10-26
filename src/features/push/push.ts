/**
 * The parts of push registration that are decisions rather than network
 * calls, kept here so they can be tested without a browser or a project.
 */

/** Why push is not available, when it is not. */
export type PushBlocker =
  | 'unconfigured' // no Firebase config in this build
  | 'no-vapid-key' // configured, but the Web Push certificate is missing
  | 'unsupported' // the browser cannot do web push at all
  | 'denied' // the user said no, and only they can undo it

export type PushState = 'off' | 'on' | PushBlocker

/**
 * What the Settings row should say. Spelled out rather than inferred in
 * the component, because "cannot" and "not yet" look the same on screen
 * and mean very different things to someone trying to turn it on.
 */
export const PUSH_HINT: Readonly<Record<PushState, string>> = {
  on: 'This device will be notified even when Ledger is closed',
  off: 'Get reminders when Ledger is closed',
  unconfigured: 'This build has no Firebase project connected',
  'no-vapid-key': 'Missing the Web Push certificate for this project',
  unsupported: 'This browser cannot receive push. On iOS, install Ledger first',
  denied: 'Blocked in your browser settings',
}

/** Only `off` can be switched on; the rest are all dead ends. */
export const canEnablePush = (state: PushState): boolean => state === 'off'

/**
 * A label for the device row, so a list of tokens is readable later. The
 * user agent is the only thing a browser will tell us, and it is a mess,
 * so this keeps the two parts anyone would recognise.
 */
export function describeDevice(userAgent: string): string {
  const os =
    /iPhone|iPad|iPod/i.test(userAgent) ? 'iOS'
    : /Android/i.test(userAgent) ? 'Android'
    : /Mac OS X/i.test(userAgent) ? 'macOS'
    : /Windows/i.test(userAgent) ? 'Windows'
    : /Linux/i.test(userAgent) ? 'Linux'
    : 'Unknown'

  // Order matters: Edge and Chrome both claim Chrome, Chrome claims Safari.
  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\//.test(userAgent) ? 'Opera'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : 'Browser'

  return `${browser} on ${os}`
}

/**
 * Reminders are time-bound: a bill due tomorrow is noise once it is
 * overdue. A day is long enough to survive a night with the phone off
 * and short enough that nothing stale arrives — FCM would otherwise hold
 * a message for four weeks.
 */
export const PUSH_TTL_SECONDS = 24 * 60 * 60
