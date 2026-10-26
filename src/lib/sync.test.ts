import { describe, expect, it } from 'vitest'
import {
  BATCH_LIMIT,
  chunk,
  forFirestore,
  isSyncedTable,
  outboxKey,
  queuedLabel,
  SYNC_HINT,
  SYNCED_TABLES,
  syncStateFrom,
  type SyncState,
} from './sync'

describe('SYNCED_TABLES', () => {
  it('leaves out the two tables that must not go up', () => {
    // Receipts are Blobs, which a document cannot hold; settings carry
    // the PIN hash and the passkey handle.
    expect(isSyncedTable('receipts')).toBe(false)
    expect(isSyncedTable('settings')).toBe(false)
    expect(isSyncedTable('outbox')).toBe(false)
  })

  it('covers every table that holds ledger data', () => {
    for (const table of [
      'accounts',
      'categories',
      'transactions',
      'recurring',
      'contacts',
      'loans',
      'loanPayments',
      'budgets',
      'goals',
    ]) {
      expect(isSyncedTable(table)).toBe(true)
    }
    expect(SYNCED_TABLES).toHaveLength(9)
  })

  it('has no duplicates, which would upload a table twice', () => {
    expect(new Set(SYNCED_TABLES).size).toBe(SYNCED_TABLES.length)
  })
})

describe('outboxKey', () => {
  it('is one key per row, so repeated edits collapse into one upload', () => {
    expect(outboxKey('transactions', 'abc')).toBe(outboxKey('transactions', 'abc'))
  })

  it('keeps the same id in two tables apart', () => {
    expect(outboxKey('transactions', 'abc')).not.toBe(outboxKey('loans', 'abc'))
  })
})

describe('chunk', () => {
  it('splits at the batch limit', () => {
    const items = Array.from({ length: BATCH_LIMIT * 2 + 7 }, (_, i) => i)
    const batches = chunk(items)
    expect(batches).toHaveLength(3)
    expect(batches[0]).toHaveLength(BATCH_LIMIT)
    expect(batches[2]).toHaveLength(7)
    expect(batches.flat()).toEqual(items)
  })

  it('stays under Firestore’s 500 operations per batch', () => {
    expect(BATCH_LIMIT).toBeLessThan(500)
  })

  it('returns nothing for nothing, rather than one empty batch', () => {
    expect(chunk([])).toEqual([])
  })

  it('refuses a size that would never finish', () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow(RangeError)
  })
})

describe('forFirestore', () => {
  it('drops absent optional fields, which Firestore will not accept', () => {
    const row = { id: 'a', amount: 1200, toAccountId: undefined, note: '' }
    const out = forFirestore(row)
    expect('toAccountId' in out).toBe(false)
    // An empty string is a value someone typed away, not an absence.
    expect(out).toEqual({ id: 'a', amount: 1200, note: '' })
  })

  it('keeps null, zero and false — none of them mean "unset"', () => {
    const out = forFirestore({ categoryId: null, limit: 0, rollover: false })
    expect(out).toEqual({ categoryId: null, limit: 0, rollover: false })
  })

  it('passes tag arrays through intact', () => {
    expect(forFirestore({ tags: ['rent', 'fixed'] })).toEqual({ tags: ['rent', 'fixed'] })
  })
})

describe('syncStateFrom', () => {
  const base = { enabled: true, configured: true, online: true, queued: 0, failed: false }

  it('reports an empty queue as done', () => {
    expect(syncStateFrom(base)).toBe('synced')
  })

  it('says offline rather than error when there is no network', () => {
    // A queue waiting for a network has not gone wrong, and calling it an
    // error sends someone looking for a fault that is not there.
    expect(syncStateFrom({ ...base, online: false, queued: 4, failed: true })).toBe('offline')
  })

  it('distinguishes sending from failing while online', () => {
    expect(syncStateFrom({ ...base, queued: 4 })).toBe('pending')
    expect(syncStateFrom({ ...base, queued: 4, failed: true })).toBe('error')
  })

  it('never claims to be synced when it is switched off', () => {
    expect(syncStateFrom({ ...base, enabled: false })).toBe('off')
    expect(syncStateFrom({ ...base, enabled: false, queued: 9 })).toBe('off')
  })

  it('puts a missing project ahead of everything else', () => {
    expect(syncStateFrom({ ...base, configured: false, enabled: false })).toBe('unconfigured')
  })
})

describe('SYNC_HINT', () => {
  const states: SyncState[] = ['off', 'unconfigured', 'offline', 'pending', 'synced', 'error']

  it('says something for every state', () => {
    for (const state of states) expect(SYNC_HINT[state]).toBeTruthy()
  })

  it('keeps the states that look alike on screen apart', () => {
    expect(new Set(states.map((s) => SYNC_HINT[s])).size).toBe(states.length)
  })
})

describe('queuedLabel', () => {
  it('counts in words a person would use', () => {
    expect(queuedLabel(0)).toBe('Up to date')
    expect(queuedLabel(1)).toBe('1 change waiting')
    expect(queuedLabel(12)).toBe('12 changes waiting')
  })
})
