/*
 * Background push. Runs only when a message arrives with no page open,
 * which is the whole reason FCM is here — the in-app reminders already
 * cover the case where Ledger is on screen.
 *
 * Its own worker, at its own scope: Workbox owns `/` and precaches the
 * app, and two registrations at one scope replace each other.
 *
 * The config arrives on this file's URL (see features/push/db.ts). A
 * worker cannot read `import.meta.env`, and writing the values in here
 * would fork them from `.env`.
 *
 * The compat SDK comes off Google's CDN because a service worker cannot
 * import from node_modules. It is the one thing in this app not served
 * from its own origin — acceptable only because this worker never runs
 * without a network: a push cannot arrive offline.
 */
/* Take over the moment a new version lands. Nothing here holds state
   worth preserving, and a stale copy of this file is how a push ends
   up being drawn twice. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

const config = Object.fromEntries(new URL(self.location.href).searchParams)

if (config.projectId) {
  firebase.initializeApp(config)
  const messaging = firebase.messaging()

  messaging.onBackgroundMessage((payload) => {
    /* A message carrying a `notification` block has already been put on
       screen by the SDK itself before this handler runs — showing it
       again is how you get two of everything. Only data-only messages
       are ours to draw, which is what the sender should be sending. */
    if (payload.notification) return

    const { title, body } = payload.data ?? {}
    if (!title) return

    self.registration.showNotification(title, {
      body: body ?? '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      // One reminder of a kind replaces the last, rather than stacking
      // up a week of them after the phone has been off.
      tag: payload.data?.tag ?? 'ledger',
      data: { url: payload.data?.url ?? '/' },
    })
  })
}

/* Tapping the notification should land on the ledger, reusing the window
   that is already open rather than adding another. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url ?? '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate?.(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
