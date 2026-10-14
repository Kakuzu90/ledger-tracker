import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshIcon } from './Icon'

/**
 * `registerType: 'prompt'` means a new service worker waits for us to say so.
 * This is the banner that asks.
 */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[96px] z-40 mx-auto flex max-w-screen items-center gap-3 px-5"
    >
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
    </div>
  )
}
