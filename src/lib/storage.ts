/**
 * Ask the browser to keep our IndexedDB out of the eviction pool.
 * There is no backend, so losing the origin's storage loses the ledger.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!('storage' in navigator) || !navigator.storage.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export interface StorageEstimate {
  usage: number
  quota: number
}

export async function estimateStorage(): Promise<StorageEstimate | null> {
  if (!('storage' in navigator) || !navigator.storage.estimate) return null
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  return { usage, quota }
}
