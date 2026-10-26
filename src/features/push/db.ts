/**
 * Turning push on, and keeping the device's token somewhere a sender can
 * find it.
 *
 * Nothing here is reached unless the user asks for it from Settings, so
 * the Firebase chunks stay off the cold start. Every path returns a
 * state rather than throwing: a ledger that works offline should not
 * break because a push project is missing.
 */

import {
  firebaseConfigParams,
  getDeviceUid,
  getFirestoreDb,
  getMessaging,
  isFirebaseConfigured,
} from '@/lib/firebase'
import { notificationState } from '@/lib/notifications'
import { describeDevice, type PushState } from './push'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

/**
 * Firebase would fetch `/firebase-messaging-sw.js` itself, but then the
 * worker has no way to learn the project config. Registering it here
 * puts the config on the query string, so `.env` stays the one source.
 *
 * Its own scope, deliberately: the app's Workbox worker owns `/`, and
 * two registrations at the same scope replace one another.
 */
async function messagingWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?${firebaseConfigParams()}`,
    { scope: '/firebase-cloud-messaging-push-scope' },
  )
}

/** Where push stands on this device, without asking for anything. */
export async function pushState(): Promise<PushState> {
  if (!isFirebaseConfigured()) return 'unconfigured'
  if (!VAPID_KEY) return 'no-vapid-key'

  const permission = notificationState()
  if (permission === 'unsupported') return 'unsupported'
  if (permission === 'denied') return 'denied'

  const messaging = await getMessaging()
  if (!messaging) return 'unsupported'

  // Granted permission is not the same as a registered token — the user
  // may have allowed notifications for the in-app reminders and never
  // turned push on.
  return permission === 'granted' && (await hasStoredToken()) ? 'on' : 'off'
}

/** The token this browser last registered, if it is still ours. */
async function hasStoredToken(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.getRegistration(
      '/firebase-cloud-messaging-push-scope',
    )
    if (!registration) return false
    const subscription = await registration.pushManager.getSubscription()
    return subscription !== null
  } catch {
    return false
  }
}

/**
 * Asks for permission, takes a token, and writes it where a sender can
 * read it. Returns the state the row should now show.
 */
export async function enablePush(): Promise<PushState> {
  const before = await pushState()
  if (before !== 'off') return before

  if (Notification.permission !== 'granted') {
    const answer = await Notification.requestPermission()
    if (answer !== 'granted') return answer === 'denied' ? 'denied' : 'off'
  }

  const messaging = await getMessaging()
  if (!messaging) return 'unsupported'

  const { getToken } = await import('firebase/messaging')
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: await messagingWorker(),
  })
  if (!token) return 'off'

  await storeToken(token)
  return 'on'
}

/**
 * Takes the token back out of circulation. The row in Firestore goes
 * first: a token a sender still believes in is worse than no token, and
 * deleting it locally is the step that can be retried.
 */
export async function disablePush(): Promise<PushState> {
  const messaging = await getMessaging()
  if (!messaging) return 'unsupported'

  const { getToken, deleteToken } = await import('firebase/messaging')
  try {
    const registration = await navigator.serviceWorker.getRegistration(
      '/firebase-cloud-messaging-push-scope',
    )
    if (registration) {
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      })
      if (token) await forgetToken(token)
    }
    await deleteToken(messaging)
  } catch {
    // The token may already be gone from Firebase's side; the row is
    // what matters and that attempt is above.
  }

  return 'off'
}

/** `users/{uid}/devices/{token}` — one row per browser install. */
async function storeToken(token: string): Promise<void> {
  const [uid, db] = await Promise.all([getDeviceUid(), getFirestoreDb()])
  if (!uid || !db) return

  const { doc, serverTimestamp, setDoc } = await import('firebase/firestore')
  await setDoc(
    doc(db, 'users', uid, 'devices', token),
    {
      token,
      label: describeDevice(navigator.userAgent),
      // The sender uses this to drop devices that stopped checking in,
      // since a token can go stale without anyone being told.
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

async function forgetToken(token: string): Promise<void> {
  const [uid, db] = await Promise.all([getDeviceUid(), getFirestoreDb()])
  if (!uid || !db) return

  const { deleteDoc, doc } = await import('firebase/firestore')
  await deleteDoc(doc(db, 'users', uid, 'devices', token))
}

/**
 * A push that arrives while the app is open does not raise a
 * notification on its own — the service worker only handles the
 * background case — so the foreground has to show it.
 */
export async function listenForPush(
  show: (title: string, body: string) => void,
): Promise<() => void> {
  const messaging = await getMessaging()
  if (!messaging) return () => {}

  const { onMessage } = await import('firebase/messaging')
  return onMessage(messaging, (payload) => {
    const { title, body } = payload.notification ?? {}
    if (title) show(title, body ?? '')
  })
}
