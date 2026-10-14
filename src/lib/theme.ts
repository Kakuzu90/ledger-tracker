import { getSetting, setSetting } from '@/db/settings'

export type ThemePref = 'light' | 'dark' | 'system'

const SETTING_KEY = 'theme'
/** First-paint mirror only; the setting itself lives in IndexedDB. */
const MIRROR_KEY = 'ledger:theme'

export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement
  if (pref === 'system') delete root.dataset.theme
  else root.dataset.theme = pref

  try {
    localStorage.setItem(MIRROR_KEY, pref)
  } catch {
    // Private mode: the OS preference is used on next launch.
  }
}

export async function loadTheme(): Promise<ThemePref> {
  const pref = await getSetting<ThemePref>(SETTING_KEY, 'system')
  applyTheme(pref)
  return pref
}

export async function saveTheme(pref: ThemePref): Promise<void> {
  await setSetting(SETTING_KEY, pref)
  applyTheme(pref)
}
