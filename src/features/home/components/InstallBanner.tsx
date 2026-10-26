import { CloseIcon, DownloadIcon, ShareIcon } from '@/ui/Icon'
import type { InstallPrompt } from '../hooks/useInstallPrompt'

/**
 * One card, two endings. Chromium gives an Install button that opens the
 * browser's own dialog; iOS gives the two steps, because WebKit has no
 * install API and a button there would be a button that lies.
 */
export function InstallBanner({ prompt }: { prompt: InstallPrompt }) {
  if (prompt.offer === 'none') return null
  const ios = prompt.offer === 'ios'

  return (
    <section className="card border-contrast bg-contrast text-contrast-ink">
      <div className="flex items-center gap-3.5">
        <span className="row-icon bg-primary text-primary-ink">
          {ios ? <ShareIcon size={20} /> : <DownloadIcon size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Install on your home screen</p>
          <p className="text-meta opacity-80">Works offline, opens like an app</p>
        </div>
        {!ios && (
          <button
            type="button"
            onClick={() => void prompt.install()}
            className="min-h-touch rounded-ctl bg-surface px-3.5 text-sm font-semibold text-ink"
          >
            Install
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => void prompt.dismiss()}
          className="-mr-1.5 flex h-touch w-touch flex-none items-center justify-center opacity-70"
        >
          <CloseIcon size={16} />
        </button>
      </div>

      {ios && (
        <ol className="mt-3 space-y-1.5 border-t border-contrast-ink/15 pt-3 text-meta opacity-90">
          <li className="flex items-center gap-2">
            <span className="font-heading tabular-nums opacity-60">1.</span>
            <span className="flex items-center gap-1.5">
              Tap <ShareIcon size={15} className="inline-block flex-none" /> Share below
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="font-heading tabular-nums opacity-60">2.</span>
            <span>Choose &ldquo;Add to Home Screen&rdquo;</span>
          </li>
        </ol>
      )}
    </section>
  )
}
