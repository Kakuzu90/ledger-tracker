import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES } from '@/lib/preferences'
import {
  APP_VERSION,
  backupAgeLabel,
  backupOverdue,
  buildSettingsView,
  type SettingsCounts,
} from './settings'

const TODAY = new Date(2026, 9, 14)
const counts: SettingsCounts = {
  categories: 14,
  tags: 9,
  accounts: 5,
  rules: 9,
  contacts: 6,
  goals: 3,
}

const ago = (days: number) =>
  new Date(TODAY.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

const build = (over: Partial<Parameters<typeof buildSettingsView>[0]> = {}) =>
  buildSettingsView(
    {
      preferences: DEFAULT_PREFERENCES,
      counts,
      lastBackupAt: ago(34),
      notifications: 'default',
      ...over,
    },
    TODAY,
    '1.2.0',
  )

describe('backupAgeLabel', () => {
  it.each([
    [undefined, 'Never'],
    [ago(0), 'Today'],
    [ago(1), 'Yesterday'],
    [ago(34), '34 days ago'],
  ])('reads %s as %s', (at, expected) => {
    expect(backupAgeLabel(at, TODAY)).toBe(expected)
  })
})

describe('backupOverdue', () => {
  it('is overdue once the interval has passed', () => {
    expect(backupOverdue(ago(34), 30, TODAY)).toBe(true)
    expect(backupOverdue(ago(30), 30, TODAY)).toBe(true)
    expect(backupOverdue(ago(29), 30, TODAY)).toBe(false)
  })

  it('counts a ledger that has never been backed up as overdue', () => {
    expect(backupOverdue(undefined, 30, TODAY)).toBe(true)
    // Even with the nudge switched off: there is nothing to restore from.
    expect(backupOverdue(undefined, 0, TODAY)).toBe(true)
  })

  it('is never late when the reminder is off', () => {
    expect(backupOverdue(ago(400), 0, TODAY)).toBe(false)
  })
})

describe('buildSettingsView', () => {
  const view = build()

  it('prints the currency with its symbol, as the mockup does', () => {
    expect(view.currencyLabel).toBe('PHP ₱')
    expect(build({ preferences: { ...DEFAULT_PREFERENCES, currency: 'USD' } }).currencyLabel)
      .toBe('USD $')
  })

  it('prints the categories and tags count the mockup shows', () => {
    expect(view.organiseLabel).toBe('14 · 9')
  })

  it('flags the stale backup', () => {
    expect(view.backupLabel).toBe('34 days ago')
    expect(view.backupOverdue).toBe(true)
  })

  it('names the reminder interval', () => {
    expect(view.backupReminderLabel).toBe('Every 30 days')
  })

  it('knows when a notice could not be raised at all', () => {
    expect(build({ notifications: 'denied' }).canNotify).toBe(false)
    expect(build({ notifications: 'unsupported' }).canNotify).toBe(false)
    expect(build({ notifications: 'granted' }).canNotify).toBe(true)
  })

  it('carries the version through', () => {
    expect(view.version).toBe('1.2.0')
  })
})

describe('APP_VERSION', () => {
  it('is substituted from package.json', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})
