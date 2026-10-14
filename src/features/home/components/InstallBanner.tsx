import { CloseIcon, DownloadIcon } from '@/ui/Icon'
import type { InstallPrompt } from '../hooks/useInstallPrompt'

export function InstallBanner({ prompt }: { prompt: InstallPrompt }) {
  if (!prompt.available) return null

  return (
    <section className="card flex items-center gap-3.5 border-contrast bg-contrast text-contrast-ink">
      <span className="row-icon bg-primary text-primary-ink">
        <DownloadIcon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Install on your home screen</p>
        <p className="text-meta opacity-80">Works offline, opens like an app</p>
      </div>
      <button
        type="button"
        onClick={() => void prompt.install()}
        className="min-h-touch rounded-ctl bg-surface px-3.5 text-sm font-semibold text-ink"
      >
        Install
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => void prompt.dismiss()}
        className="flex h-touch w-6 items-center justify-center opacity-70"
      >
        <CloseIcon size={16} />
      </button>
    </section>
  )
}
