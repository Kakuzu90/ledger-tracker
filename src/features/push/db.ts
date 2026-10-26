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
const WORKER_SCOPE = '/firebase-cloud-messaging-push-scope'

async function messagingWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?${firebaseConfigParams()}`,
    { scope: WORKER_SCOPE },
  )
  await dropStrayWorkers(registration)
  return activated(registration)
}

/**
 * Firebase registers a worker of its own if `getToken` is ever called
 * without one, and it uses a different scope — so a second messaging
 * worker can be left behind holding a live subscription, and every
 * push then arrives twice.
 */
async function dropStrayWorkers(keep: ServiceWorkerRegistration): Promise<void> {
  try {
    const all = await navigator.serviceWorker.getRegistrations()
    await Promise.all(
      all
        .filter((other) => other.scope !== keep.scope && isMessagingWorker(other))
        .map((other) => other.unregister()),
    )
  } catch {
    // Not being able to tidy up is no reason to fail turning push on.
  }
}

function isMessagingWorker(registration: ServiceWorkerRegistration): boolean {
  const worker = registration.active ?? registration.waiting ?? registration.installing
  return worker?.scriptURL.includes('firebase-messaging-sw.js') ?? false
}

/**
 * Asks the browser to re-fetch the worker script. Nothing else does:
 * no page is ever loaded under that scope, so without this a deployed
 * fix to the worker would not reach a device until it next toggled the
 * switch.
 */
export async function refreshPushWorker(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.getRegistration(WORKER_SCOPE)
    await registration?.update()
  } catch {
    // Offline, most likely. It will be tried again next launch.
  }
}

/**
 * `register()` resolves as soon as the worker starts installing, but a
 * push subscription needs one that is already running — asking too
 * early fails with "no active Service Worker". On a first visit that is
 * every time, since there is nothing registered yet to inherit.
 */
function activated(
  registration: ServiceWorkerRegistration,
): Promise<ServiceWorkerRegistration> {
  if (registration.active) return Promise.resolve(registration)

  const worker = registration.installing ?? registration.waiting
  if (!worker) return Promise.resolve(registration)

  return new Promise((resolve, reject) => {
    const check = () => {
      if (worker.state === 'activated') {
        worker.removeEventListener('statechange', check)
        resolve(registration)
      } else if (worker.state === 'redundant') {
        // The script failed to parse or install. Waiting on it would
        // hang the switch, and nothing else will move it on.
        worker.removeEventListener('statechange', check)
        reject(new Error('The push worker could not be installed'))
      }
    }
    worker.addEventListener('statechange', check)
    check()
  })
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

/**
 * Whether push is on, answered with browser APIs alone. `pushState`
 * would do it too, but it loads the Firebase SDK to ask — and the
 * foreground listener runs on every launch, including the launches of
 * everyone who never turned push on.
 */
export async function pushIsOn(): Promise<boolean> {
  if (!isFirebaseConfigured() || !VAPID_KEY) return false
  if (notificationState() !== 'granted') return false
  return hasStoredToken()
}

/** The token this browser last registered, if it is still ours. */
async function hasStoredToken(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.getRegistration(WORKER_SCOPE)
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

  // Registering a worker and reaching Google both fail in ordinary ways
  // — a dropped connection, a worker that will not install. The switch
  // has to come back and say so rather than leave a rejected promise.
  try {
    const { getToken } = await import('firebase/messaging')
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: await messagingWorker(),
    })
    if (!token) return 'failed'

    // The only way to aim a test message at this browser is to paste its
    // token into the console's sender, and nothing else prints it.
    if (import.meta.env.DEV) console.info('[push] FCM registration token:\n' + token)

    await storeToken(token)
    return 'on'
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[push] could not register', error)
    return 'failed'
  }
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
    const registration = await navigator.serviceWorker.getRegistration(WORKER_SCOPE)
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
    // Data-only is what the sender uses, so that the background worker
    // is the only thing drawing a notification; `notification` is still
    // read because that is all the Firebase console can send.
    const title = payload.data?.title ?? payload.notification?.title
    const body = payload.data?.body ?? payload.notification?.body
    if (title) show(title, body ?? '')
  })
}
