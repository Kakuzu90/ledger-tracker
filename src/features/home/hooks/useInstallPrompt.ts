import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { setSetting } from '@/db/settings'

/** Chromium's install prompt event, which TypeScript's DOM lib does not have. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'installBannerDismissedAt'

export interface InstallPrompt {
  /** The browser offered an install and the user has not waved it away. */
  available: boolean
  install: () => Promise<void>
  dismiss: () => Promise<void>
}

/**
 * The home banner only appears where the browser says the app is installable.
 * Safari never fires this event, so the banner stays hidden there rather than
 * showing instructions nobody asked for.
 */
export function useInstallPrompt(): InstallPrompt {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const dismissed = useLiveQuery(() => db.settings.get(DISMISSED_KEY), [])

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Keep the event so the banner's button can trigger it later.
      e.preventDefault()
      setEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setEvent(null)

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!event) return
    await event.prompt()
    const { outcome } = await event.userChoice
    setEvent(null)
    if (outcome === 'dismissed') await setSetting(DISMISSED_KEY, new Date().toISOString())
  }, [event])

  const dismiss = useCallback(async () => {
    setEvent(null)
    await setSetting(DISMISSED_KEY, new Date().toISOString())
  }, [])

  return {
    available: event !== null && dismissed === undefined,
    install,
    dismiss,
  }
}
