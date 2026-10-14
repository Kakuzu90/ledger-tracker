import { describe, expect, it } from 'vitest'
import {
  backupFilename,
  base64ToBytes,
  BACKUP_VERSION,
  buildEnvelope,
  bytesToBase64,
  decryptBackup,
  emptyTables,
  encryptBackup,
  formatBytes,
  parseBackup,
  summarise,
  type BackupTables,
} from './backup'

const stamps = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }
const EXPORTED = new Date('2026-10-14T09:00:00.000Z')

function tables(over: Partial<BackupTables> = {}): BackupTables {
  return { ...emptyTables(), ...over }
}

const account = {
  id: 'a1',
  name: 'BPI Savings',
  type: 'bank' as const,
  currency: 'PHP',
  openingBalance: 10_000_00,
  color: '#1D4E89',
  archived: false,
  ...stamps,
}

const txn = (id: string) => ({
  id,
  type: 'expense' as const,
  amount: 500_00,
  accountId: 'a1',
  date: '2026-10-02',
  note: 'Lunch, with a comma',
  tags: ['work'],
  status: 'posted' as const,
  ...stamps,
})

describe('buildEnvelope', () => {
  it('stamps the app, the version and when it was made', () => {
    expect(buildEnvelope(tables(), EXPORTED)).toMatchObject({
      app: 'ledger',
      version: BACKUP_VERSION,
      exportedAt: '2026-10-14T09:00:00.000Z',
    })
  })

  it('round-trips through JSON unchanged', () => {
    const envelope = buildEnvelope(tables({ accounts: [account], transactions: [txn('t1')] }), EXPORTED)
    const back = parseBackup(JSON.stringify(envelope))
    expect(back.kind).toBe('plain')
    if (back.kind !== 'plain') return
    expect(back.envelope.data.accounts[0]).toEqual(account)
    expect(back.envelope.data.transactions[0]?.note).toBe('Lunch, with a comma')
  })
})

describe('backupFilename', () => {
  it('names the file by the day', () => {
    expect(backupFilename(EXPORTED)).toBe('ledger-backup-2026-10-14.json')
  })

  it('says so when the file needs a password', () => {
    expect(backupFilename(EXPORTED, true)).toBe('ledger-backup-2026-10-14-encrypted.json')
  })
})

describe('parseBackup', () => {
  it('refuses something that is not JSON', () => {
    expect(parseBackup('not json at all')).toMatchObject({
      kind: 'invalid',
      problem: 'That file is not a Ledger backup',
    })
  })

  it('refuses JSON from another app', () => {
    expect(parseBackup('{"app":"somethingelse","data":{}}').kind).toBe('invalid')
  })

  it('refuses a file with no data block', () => {
    expect(parseBackup('{"app":"ledger","version":1}')).toMatchObject({
      kind: 'invalid',
      problem: 'This backup has no data in it',
    })
  })

  it('refuses a table that is not a list', () => {
    const text = '{"app":"ledger","version":1,"data":{"transactions":"lots"}}'
    expect(parseBackup(text)).toMatchObject({ kind: 'invalid' })
  })

  it('fills in a table the file left out rather than failing', () => {
    const text = '{"app":"ledger","version":1,"data":{"accounts":[]}}'
    const parsed = parseBackup(text)
    expect(parsed.kind).toBe('plain')
    if (parsed.kind !== 'plain') return
    expect(parsed.envelope.data.goals).toEqual([])
  })

  it('recognises an encrypted file without the password', () => {
    const text = JSON.stringify({
      app: 'ledger',
      version: 1,
      exportedAt: '2026-10-14T09:00:00.000Z',
      encrypted: true,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 210000, salt: 'c2FsdA==' },
      cipher: { name: 'AES-GCM', iv: 'aXZpdml2aXY=' },
      payload: 'ZGF0YQ==',
    })
    expect(parseBackup(text).kind).toBe('encrypted')
  })

  it('refuses an encrypted file missing its salt', () => {
    const text = JSON.stringify({ app: 'ledger', encrypted: true, payload: 'x' })
    expect(parseBackup(text)).toMatchObject({
      kind: 'invalid',
      problem: 'This encrypted backup is incomplete',
    })
  })
})

describe('summarise', () => {
  const envelope = buildEnvelope(
    tables({
      accounts: [account],
      transactions: [txn('t1'), txn('t2'), txn('t3')],
      goals: [{ id: 'g1', name: 'Japan trip', target: 1, saved: 0, ...stamps }],
    }),
    EXPORTED,
  )

  it('counts every row in the file', () => {
    expect(summarise(envelope).rows).toBe(5)
  })

  it('leads with the biggest tables and leaves the empty ones out', () => {
    expect(summarise(envelope).lines).toEqual([
      { label: 'transactions', count: 3 },
      { label: 'accounts', count: 1 },
      { label: 'goals', count: 1 },
    ])
  })

  it('says nothing is wrong with a file from this version', () => {
    expect(summarise(envelope).warning).toBeUndefined()
  })

  it('warns about a file from a newer version', () => {
    const future = { ...envelope, version: BACKUP_VERSION + 1 }
    expect(summarise(future).warning).toContain('newer version')
  })
})

describe('base64', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 42])
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('handles more bytes than fit in one call stack', () => {
    const big = new Uint8Array(200_000).map((_, i) => i % 256)
    expect(base64ToBytes(bytesToBase64(big))).toEqual(big)
  })
})

describe('encryption', () => {
  const envelope = buildEnvelope(tables({ accounts: [account] }), EXPORTED)

  it('round-trips with the right password', async () => {
    const locked = await encryptBackup(envelope, 'correct horse')
    const back = await decryptBackup(locked, 'correct horse')
    expect(back.data.accounts[0]).toEqual(account)
  }, 20_000)

  it('leaves nothing readable in the file', async () => {
    const locked = await encryptBackup(envelope, 'correct horse')
    expect(JSON.stringify(locked)).not.toContain('BPI Savings')
    expect(locked.exportedAt).toBe(envelope.exportedAt)
  }, 20_000)

  it('refuses the wrong password with something to show the user', async () => {
    const locked = await encryptBackup(envelope, 'correct horse')
    await expect(decryptBackup(locked, 'wrong horse')).rejects.toThrow(
      'Wrong password, or the file is damaged',
    )
  }, 20_000)

  it('notices a tampered payload', async () => {
    const locked = await encryptBackup(envelope, 'correct horse')
    const tampered = { ...locked, payload: `${locked.payload.slice(0, -4)}AAAA` }
    await expect(decryptBackup(tampered, 'correct horse')).rejects.toThrow()
  }, 20_000)

  it('uses a fresh salt and iv each time, so two files never match', async () => {
    const a = await encryptBackup(envelope, 'same password')
    const b = await encryptBackup(envelope, 'same password')
    expect(a.kdf.salt).not.toBe(b.kdf.salt)
    expect(a.payload).not.toBe(b.payload)
  }, 20_000)

  it('will not encrypt under an empty password', async () => {
    await expect(encryptBackup(envelope, '')).rejects.toThrow('Choose a password')
  })
})

describe('formatBytes', () => {
  it.each([
    [0, '0 KB'],
    [512, '512 bytes'],
    [4_404_019, '4.2 MB'],
    [1024, '1.0 KB'],
    [150 * 1024, '150 KB'],
    [3 * 1024 ** 3, '3.0 GB'],
  ])('prints %i as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })
})
