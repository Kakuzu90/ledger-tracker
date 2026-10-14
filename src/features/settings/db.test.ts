import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import { loadSampleData } from '@/db/sample'
import { setSetting } from '@/db/settings'
import { activeCurrency, DEFAULT_CURRENCY, setActiveCurrency } from '@/lib/money'
import { useUIStore } from '@/store/ui'
import { applyStartupPreferences, runReminders, savePreference } from './db'

const TODAY = new Date(2026, 9, 14)

const reset = async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
  setActiveCurrency(DEFAULT_CURRENCY)
  useUIStore.setState({ currency: DEFAULT_CURRENCY, amountsHidden: false })
  document.documentElement.removeAttribute('data-theme')
}

beforeEach(reset)

describe('savePreference', () => {
  it('stores the value', async () => {
    await savePreference('name', 'Alex')
    expect(await db.settings.get('name')).toMatchObject({ value: 'Alex' })
  })

  it('applies a theme change straight away', async () => {
    await savePreference('theme', 'dark')
    expect(document.documentElement.dataset.theme).toBe('dark')

    await savePreference('theme', 'system')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('applies a currency change to what is already on screen', async () => {
    await savePreference('currency', 'USD')
    expect(activeCurrency()).toBe('USD')
    expect(useUIStore.getState().currency).toBe('USD')
  })
})

describe('applyStartupPreferences', () => {
  it('takes the defaults from an empty table', async () => {
    const preferences = await applyStartupPreferences()
    expect(preferences.currency).toBe('PHP')
    expect(useUIStore.getState().amountsHidden).toBe(false)
  })

  it('puts the stored currency into service', async () => {
    await setSetting('currency', 'SGD')
    await applyStartupPreferences()

    expect(activeCurrency()).toBe('SGD')
    expect(useUIStore.getState().currency).toBe('SGD')
  })

  it('starts with amounts masked when that is what the user asked for', async () => {
    await setSetting('hideAmountsOnOpen', true)
    await applyStartupPreferences()
    expect(useUIStore.getState().amountsHidden).toBe(true)
  })

  it('does not unmask amounts the user hid during the session', async () => {
    useUIStore.setState({ amountsHidden: true })
    await applyStartupPreferences()
    expect(useUIStore.getState().amountsHidden).toBe(true)
  })
})

describe('runReminders', () => {
  beforeEach(async () => {
    await loadSampleData(db, { today: TODAY })
  })

  it('raises nothing when every reminder is switched off', async () => {
    expect(await runReminders(TODAY)).toEqual({
      bills: false,
      loans: false,
      budgets: false,
    })
    expect(await db.settings.get('lastLoanNotice')).toBeUndefined()
    expect(await db.settings.get('lastBudgetNotice')).toBeUndefined()
  })

  it('looks for loans and budgets once the switches are on', async () => {
    await setSetting('loanReminders', true)
    await setSetting('budgetAlerts', true)

    await runReminders(TODAY)

    // Juan's concert tickets are overdue and Bills is over its budget, so
    // both were worth raising — whether the browser showed them or not.
    expect(await db.settings.get('lastLoanNotice')).toMatchObject({ value: '2026-10-14' })
    expect(await db.settings.get('lastBudgetNotice')).toMatchObject({ value: '2026-10-14' })
  })

  it('does not raise the same reminder twice in a day', async () => {
    await setSetting('loanReminders', true)
    await runReminders(TODAY)
    await db.settings.put({ key: 'lastLoanNotice', value: '2026-10-14' })

    // A second open on the same day finds the mark already there.
    await runReminders(TODAY)
    expect(await db.settings.get('lastLoanNotice')).toMatchObject({ value: '2026-10-14' })
  })

  it('says nothing about a quiet day', async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
    await setSetting('loanReminders', true)
    await setSetting('budgetAlerts', true)

    await runReminders(TODAY)
    expect(await db.settings.get('lastLoanNotice')).toBeUndefined()
    expect(await db.settings.get('lastBudgetNotice')).toBeUndefined()
  })
})
