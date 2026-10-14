import { useRegisterSW } from 'virtual:pwa-register/react'
import { CheckIcon, RefreshIcon } from './Icon'

/** How often an installed app looks for a new build. */
const CHECK_EVERY_MS = 60 * 60 * 1000

/**
 * The service worker's two pieces of news.
 *
 * `registerType: 'prompt'` means a new build waits rather than swapping
 * itself in — reloading under someone mid-entry is not a trade worth making
 * for a ledger — so this is the banner that asks. The first install also
 * says once that the app is ready offline, because "it works with no
 * signal" is the whole promise and it is otherwise invisible.
 */
export function UpdateBanner() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return

      /**
       * An installed app can run for days without a navigation, so it has
       * to go looking. Only when the tab is in front and the device thinks
       * it has a network: `update()` rejects when the script cannot be
       * fetched, and an app that is offline — the state this one is built
       * for — would otherwise throw on every check.
       */
      const check = () => {
        if (document.visibilityState !== 'visible' || !navigator.onLine) return
        registration.update().catch(() => {
          // Nothing to do and nothing to say: the current version keeps
          // running and the next check will try again.
        })
      }

      setInterval(check, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', check)
      window.addEventListener('online', check)
    },
  })

  if (!needRefresh && !offlineReady) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[96px] z-40 mx-auto flex max-w-screen items-center gap-3 px-5"
    >
      {needRefresh ? (
        <div className="card flex w-full items-center gap-3 border-contrast bg-contrast text-contrast-ink">
          <RefreshIcon size={20} />
          <p className="grow font-medium">A new version is ready</p>
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
            className="min-h-touch rounded-ctl bg-surface px-3.5 font-semibold text-ink"
          >
            Reload
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setNeedRefresh(false)}
            className="min-h-touch px-1 text-sm font-medium opacity-80"
          >
            Later
          </button>
        </div>
      ) : (
        <div className="card flex w-full items-center gap-3 border-contrast bg-contrast text-contrast-ink">
          <CheckIcon size={20} />
          <p className="grow font-medium">Ready to use offline</p>
          <button
            type="button"
            onClick={() => setOfflineReady(false)}
            className="min-h-touch px-1 text-sm font-medium opacity-80"
          >
            Got it
          </button>
        </div>
      )}
    </div>
  )
}
