/**
 * Bill reminders, within what an app with no backend can actually promise.
 *
 * Without a push server nothing can wake the app, so these fire when Ledger
 * is opened — the scheduler runs, sees what is due, and raises a system
 * notice. That is a real reminder on a phone where the PWA is in the app
 * switcher, and the copy on the banner says exactly that rather than
 * implying a push that will never come.
 */

export type NotificationState = 'unsupported' | 'default' | 'granted' | 'denied'

const supported = (): boolean => typeof Notification !== 'undefined'

export function notificationState(): NotificationState {
  if (!supported()) return 'unsupported'
  const permission = Notification.permission
  return permission === 'granted' || permission === 'denied' ? permission : 'default'
}

/** Prompts, from a user gesture. Resolves to where things stand afterwards. */
export async function askForNotifications(): Promise<NotificationState> {
  if (!supported()) return 'unsupported'
  if (Notification.permission !== 'default') return notificationState()

  try {
    await Notification.requestPermission()
  } catch {
    // Older Safari takes a callback and rejects the promise form.
  }
  return notificationState()
}

/**
 * Shows one notice. Returns whether it actually went out.
 *
 * The tag is per kind, so a bill reminder and a budget alert raised in the
 * same launch sit side by side instead of replacing each other.
 */
export function notify(title: string, body: string, tag = 'ledger'): boolean {
  if (notificationState() !== 'granted') return false
  try {
    new Notification(title, { body, tag })
    return true
  } catch {
    // Some browsers only allow this from a service worker.
    return false
  }
}

/**
 * `["Rent"]` → `"Rent"`, `["Rent", "Spotify"]` → `"Rent and Spotify"`,
 * three or more → `"Rent and 2 more"`. One notice line cannot carry a list.
 */
export function listNames(names: readonly string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0] as string
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names[0]} and ${names.length - 1} more`
}

/** "Rent is due", "Rent and 2 more are due". */
export function reminderText(names: readonly string[]): string {
  if (names.length === 0) return ''
  return `${listNames(names)} ${names.length === 1 ? 'is' : 'are'} due`
}

/** "A loan with Juan is due", "Loans with Juan and 2 more are due". */
export function loanReminderText(names: readonly string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return `A loan with ${names[0]} is due`
  return `Loans with ${listNames(names)} are due`
}

/**
 * The budget alert, worded for what actually happened: over the limit is a
 * different sentence from close to it, and the month as a whole outranks
 * any single category.
 */
export function budgetAlertText(alerts: {
  overallOver: boolean
  over: readonly string[]
  near: readonly string[]
}): string {
  if (alerts.overallOver) return 'You are over your budget for the month'
  if (alerts.over.length > 0) {
    const list = listNames(alerts.over)
    return `${list} ${alerts.over.length === 1 ? 'is' : 'are'} over budget`
  }
  if (alerts.near.length > 0) {
    const list = listNames(alerts.near)
    return alerts.near.length === 1
      ? `${list} is close to its limit`
      : `${list} are close to their limits`
  }
  return ''
}
