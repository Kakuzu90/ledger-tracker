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

/** Shows one notice. Returns whether it actually went out. */
export function notify(title: string, body: string): boolean {
  if (notificationState() !== 'granted') return false
  try {
    new Notification(title, { body, tag: 'ledger-bills' })
    return true
  } catch {
    // Some browsers only allow this from a service worker.
    return false
  }
}

/** "Rent is due today", "Rent and 2 more are due in the next day". */
export function reminderText(names: readonly string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return `${names[0]} is due`
  if (names.length === 2) return `${names[0]} and ${names[1]} are due`
  return `${names[0]} and ${names.length - 1} more are due`
}
