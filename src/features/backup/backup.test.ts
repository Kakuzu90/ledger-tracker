import { describe, expect, it } from 'vitest'
import { buildEnvelope, emptyTables, summarise } from '@/lib/backup'
import { buildBackupView, storageLabel, summaryLine } from './backup'

const TODAY = new Date(2026, 9, 14)
const ago = (days: number) =>
  new Date(TODAY.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

const storage = { usage: 4_404_019, receipts: 38, persisted: true }

const build = (over: Partial<Parameters<typeof buildBackupView>[0]> = {}) =>
  buildBackupView(
    { lastBackupAt: ago(34), encrypt: false, reminderDays: 30, storage, ...over },
    TODAY,
  )

describe('storageLabel', () => {
  it('prints the size and the receipt count, as the mockup does', () => {
    expect(storageLabel(storage)).toBe('4.2 MB · 38 receipts')
  })

  it('counts one receipt in the singular', () => {
    expect(storageLabel({ ...storage, receipts: 1 })).toBe('4.2 MB · 1 receipt')
  })

  it('says what it can when the browser will not estimate', () => {
    expect(storageLabel({ ...storage, usage: null })).toBe('38 receipts')
  })
})

describe('buildBackupView', () => {
  it('headlines the age of the last backup', () => {
    expect(build().ageHeadline).toBe('Last backup 34 days ago')
    expect(build({ lastBackupAt: ago(0) }).ageHeadline).toBe('Last backup today')
  })

  it('speaks plainly when there has never been one', () => {
    const fresh = build({ lastBackupAt: undefined })
    expect(fresh.ageLabel).toBe('Never')
    expect(fresh.ageHeadline).toBe('You have never backed this up')
    expect(fresh.overdue).toBe(true)
  })

  it('goes quiet once a backup is recent again', () => {
    expect(build({ lastBackupAt: ago(2) }).overdue).toBe(false)
  })

  it('names the reminder interval', () => {
    expect(build().reminderLabel).toBe('Every 30 days')
    expect(build({ reminderDays: 0 }).reminderLabel).toBe('Never')
  })
})

describe('summaryLine', () => {
  it('lists the biggest tables in the file', () => {
    const envelope = buildEnvelope({
      ...emptyTables(),
      transactions: Array.from({ length: 1284 }, (_, i) => ({ id: `t${i}` }) as never),
      loans: Array.from({ length: 9 }, (_, i) => ({ id: `l${i}` }) as never),
      accounts: Array.from({ length: 5 }, (_, i) => ({ id: `a${i}` }) as never),
    })
    expect(summaryLine(summarise(envelope))).toBe(
      '1,284 transactions · 9 loans · 5 accounts',
    )
  })

  it('says so when the file is empty', () => {
    expect(summaryLine(summarise(buildEnvelope(emptyTables())))).toBe('Nothing in it')
  })
})
