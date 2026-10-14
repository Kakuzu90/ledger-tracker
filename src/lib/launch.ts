/**
 * What the app should do on arrival, read off the URL.
 *
 * The manifest's shortcuts (vite.config.ts) are plain links. Three of them
 * are routes and need nothing here; "Add expense" is not a route — Quick Add
 * is a sheet over whatever screen you are on — so it arrives as `/?add=expense`
 * and is turned into an action here.
 */

import type { TransactionType } from '@/db/types'

const PARAM = 'add'
const TYPES: readonly TransactionType[] = ['expense', 'income', 'transfer']

export interface LaunchAction {
  kind: 'quick-add'
  type: TransactionType
}

export function parseLaunchAction(search: string): LaunchAction | null {
  const value = new URLSearchParams(search).get(PARAM)
  if (value === null) return null
  return TYPES.includes(value as TransactionType)
    ? { kind: 'quick-add', type: value as TransactionType }
    : null
}

/**
 * The same URL with the launch parameter taken out, so a refresh does not
 * reopen the sheet and the address bar does not keep a spent instruction.
 */
export function withoutLaunchAction(url: string): string {
  const parsed = new URL(url, 'http://localhost')
  parsed.searchParams.delete(PARAM)

  const search = parsed.searchParams.toString()
  return `${parsed.pathname}${search ? `?${search}` : ''}${parsed.hash}`
}
