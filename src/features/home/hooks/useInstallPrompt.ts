import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { setSetting } from '@/db/settings'
import {
  clearStashedPrompt,
  installOffer,
  onApple,
  runningInstalled,
  stashedPrompt,
  type BeforeInstallPromptEvent,
  type InstallOffer,
} from '@/lib/install'

const DISMISSED_KEY = 'installBannerDismissedAt'

export interface InstallPrompt {
  /** What to show: the browser's own prompt, iOS instructions, or nothing. */
  offer: InstallOffer
  install: () => Promise<void>
  dismiss: () => Promise<void>
}

/**
 * Whether to offer an install, and in which form.
 *
 * The `beforeinstallprompt` event is not waited for here: Chromium fires
 * it long before React mounts, so index.html catches it and this reads
 * what was stashed, listening only for the custom event that says the
 * stash changed.
 */
export function useInstallPrompt(): InstallPrompt {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(stashedPrompt)
  // `undefined` until the read lands, `null` once it lands and there is
  // no row — so a banner that was dismissed does not flash on screen for
  // a frame first.
  const dismissed = useLiveQuery<string | null, undefined>(
    async () => ((await db.settings.get(DISMISSED_KEY))?.value as string | undefined) ?? null,
    [],
    undefined,
  )

  useEffect(() => {
    const onChange = () => setEvent(stashedPrompt())
    window.addEventListener('ledger:installable', onChange)
    return () => window.removeEventListener('ledger:installable', onChange)
  }, [])

  const forget = useCallback(async () => {
    clearStashedPrompt()
    setEvent(null)
    await setSetting(DISMISSED_KEY, new Date().toISOString())
  }, [])

  const install = useCallback(async () => {
    if (!event) return
    await event.prompt()
    const { outcome } = await event.userChoice
    // The event is single-use either way; only a refusal starts the
    // cooling-off period.
    clearStashedPrompt()
    setEvent(null)
    if (outcome === 'dismissed') await forget()
  }, [event, forget])

  const offer: InstallOffer =
    dismissed === undefined
      ? 'none'
      : installOffer({
          event,
          apple: onApple(),
          installed: runningInstalled(),
          dismissedAt: dismissed ?? undefined,
          now: new Date(),
        })

  return { offer, install, dismiss: forget }
}
