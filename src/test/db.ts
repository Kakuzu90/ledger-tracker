import { LedgerDB } from '@/db/db'

/**
 * A throwaway database per test, backed by fake-indexeddb. Dexie keys
 * databases by name, so each test gets its own.
 */
let counter = 0

export async function freshDb(): Promise<LedgerDB> {
  const db = new LedgerDB(`ledger-test-${counter++}`)
  await db.open()
  return db
}
