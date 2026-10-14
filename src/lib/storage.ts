/**
 * Ask the browser to keep our IndexedDB out of the eviction pool.
 * There is no backend, so losing the origin's storage loses the ledger.
 *
 * Every entry point is optional-chained: `navigator.storage` is missing in
 * older browsers and in some embedded webviews, and a thrown TypeError here
 * would take the launch down with it.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator.storage?.persist !== 'function') return false
  try {
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** Whether the browser has already promised to keep the data. */
export async function isStoragePersisted(): Promise<boolean> {
  if (typeof navigator.storage?.persisted !== 'function') return false
  try {
    return await navigator.storage.persisted()
  } catch {
    return false
  }
}

export interface StorageEstimate {
  usage: number
  quota: number
}

export async function estimateStorage(): Promise<StorageEstimate | null> {
  if (typeof navigator.storage?.estimate !== 'function') return null
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    return { usage, quota }
  } catch {
    return null
  }
}
