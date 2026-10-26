/**
 * Firebase, loaded only if it is configured and only when something asks
 * for it.
 *
 * Two constraints shape this file. The ledger is offline-first and owns
 * its data in IndexedDB, so nothing here may be on the path to a first
 * paint and nothing may fail when Firebase is absent — a checkout with no
 * `.env` has to run exactly as before. And the SDK is large next to the
 * app, so it is behind a dynamic import: Rollup splits it into its own
 * chunk that a cold start never downloads.
 */

import type { FirebaseApp, FirebaseOptions } from 'firebase/app'
import type { Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'
import type { Messaging } from 'firebase/messaging'

/**
 * Vite only hands the browser variables prefixed with `VITE_`, which is
 * also the signal that these are public: the web config ships inside the
 * bundle, as Firebase intends. It is not a secret, and it is not what
 * protects the data — security rules are.
 */
const config: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  ...(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
    ? { measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID }
    : {}),
}

/**
 * The public config, for handing to the messaging service worker. A
 * worker cannot read `import.meta.env`, and hardcoding the values in
 * `public/` would fork them from `.env`, so they travel on its URL.
 */
export const firebaseConfigParams = (): string =>
  new URLSearchParams(
    Object.entries(config).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString()

/** Everything but `measurementId`, which only Analytics needs. */
const REQUIRED = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
] as const satisfies ReadonlyArray<keyof FirebaseOptions>

/** Which required keys are missing or blank. Empty when good to go. */
export function missingConfig(options: FirebaseOptions = config): string[] {
  return REQUIRED.filter((key) => {
    const value = options[key]
    return typeof value !== 'string' || value.trim() === ''
  })
}

/**
 * Whether this build can talk to Firebase at all. Every caller checks
 * this first, so a checkout without a `.env` degrades to the local-only
 * app rather than throwing on load.
 */
export const isFirebaseConfigured = (): boolean => missingConfig().length === 0

/** One app per page, created on first use. */
let app: Promise<FirebaseApp | null> | null = null

/**
 * The initialised app, or `null` when there is no configuration.
 *
 * Returning `null` rather than throwing is deliberate: "no Firebase" is a
 * supported state for this app, not an error, and callers should be able
 * to branch on it without a try/catch.
 */
export async function getFirebaseApp(): Promise<FirebaseApp | null> {
  if (!isFirebaseConfigured()) return null

  app ??= import('firebase/app')
    .then(({ getApps, getApp, initializeApp }) =>
      // Vite's HMR can run this module twice; Firebase throws on a
      // second `initializeApp` with the same name.
      getApps().length > 0 ? getApp() : initializeApp(config),
    )
    .catch(() => {
      // The chunk is deliberately not precached, so offline this import
      // simply fails. That is the expected path for an offline-first
      // app, not an error — and it must not be cached as a rejection,
      // or the next attempt online would fail too.
      app = null
      return null
    })

  return app
}

/**
 * Anonymous sign-in gives the device a stable uid with no account and no
 * login screen — enough to scope its own rows in Firestore, which is all
 * a single-user ledger needs. Real sign-in only becomes necessary when
 * the same ledger has to reach a second device.
 */
export async function getFirebaseAuth(): Promise<Auth | null> {
  const instance = await getFirebaseApp()
  if (!instance) return null
  const { getAuth } = await import('firebase/auth')
  return getAuth(instance)
}

/** The current uid, signing in anonymously the first time. */
export async function getDeviceUid(): Promise<string | null> {
  const auth = await getFirebaseAuth()
  if (!auth) return null
  if (auth.currentUser) return auth.currentUser.uid

  const { signInAnonymously } = await import('firebase/auth')
  const { user } = await signInAnonymously(auth)
  return user.uid
}

export async function getFirestoreDb(): Promise<Firestore | null> {
  const instance = await getFirebaseApp()
  if (!instance) return null
  const { getFirestore } = await import('firebase/firestore')
  return getFirestore(instance)
}

/**
 * Messaging, or null where the browser cannot do web push — Safari
 * before 16.4, anything not on HTTPS, a private window, an iOS browser
 * that has not been installed to the home screen. `isSupported()` is the
 * only reliable way to ask; feature-detecting `Notification` is not
 * enough.
 */
export async function getMessaging(): Promise<Messaging | null> {
  const instance = await getFirebaseApp()
  if (!instance) return null
  const { getMessaging: get, isSupported } = await import('firebase/messaging')
  return (await isSupported()) ? get(instance) : null
}
