import { describe, expect, it } from 'vitest'
import {
  budgetAlertText,
  listNames,
  loanReminderText,
  notificationState,
  notify,
  reminderText,
} from './notifications'

describe('reminderText', () => {
  it.each([
    [[], ''],
    [['Rent'], 'Rent is due'],
    [['Rent', 'Spotify'], 'Rent and Spotify are due'],
    [['Rent', 'Spotify', 'Internet'], 'Rent and 2 more are due'],
    [['Rent', 'Spotify', 'Internet', 'Netflix'], 'Rent and 3 more are due'],
  ])('turns %j into %s', (names, expected) => {
    expect(reminderText(names)).toBe(expected)
  })
})

describe('without the Notification API', () => {
  // jsdom does not implement it, which is also the Safari-on-iOS case.
  it('reports that it is unsupported rather than throwing', () => {
    expect(notificationState()).toBe('unsupported')
  })

  it('quietly declines to show anything', () => {
    expect(notify('Ledger', 'Rent is due')).toBe(false)
  })
})

describe('listNames', () => {
  it.each([
    [[], ''],
    [['Rent'], 'Rent'],
    [['Rent', 'Spotify'], 'Rent and Spotify'],
    [['Rent', 'Spotify', 'Netflix'], 'Rent and 2 more'],
  ])('joins %j as %s', (names, expected) => {
    expect(listNames(names)).toBe(expected)
  })
})

describe('loanReminderText', () => {
  it('says nothing when nothing is due', () => {
    expect(loanReminderText([])).toBe('')
  })

  it('names the one person', () => {
    expect(loanReminderText(['Juan'])).toBe('A loan with Juan is due')
  })

  it('counts the rest', () => {
    expect(loanReminderText(['Juan', 'Maria', 'Ana'])).toBe(
      'Loans with Juan and 2 more are due',
    )
  })
})

describe('budgetAlertText', () => {
  const alerts = (over: string[] = [], near: string[] = [], overallOver = false) => ({
    overallOver,
    over,
    near,
  })

  it('says nothing when every budget is comfortable', () => {
    expect(budgetAlertText(alerts())).toBe('')
  })

  it('leads with the month when the whole budget is blown', () => {
    expect(budgetAlertText(alerts(['Bills'], ['Food'], true))).toBe(
      'You are over your budget for the month',
    )
  })

  it('names what went over', () => {
    expect(budgetAlertText(alerts(['Bills']))).toBe('Bills is over budget')
    expect(budgetAlertText(alerts(['Bills', 'Food']))).toBe('Bills and Food are over budget')
  })

  it('distinguishes close to the limit from past it', () => {
    expect(budgetAlertText(alerts([], ['Food']))).toBe('Food is close to its limit')
    expect(budgetAlertText(alerts([], ['Food', 'Transport']))).toBe(
      'Food and Transport are close to their limits',
    )
  })

  it('does not mention what is merely close once something is over', () => {
    expect(budgetAlertText(alerts(['Bills'], ['Food']))).toBe('Bills is over budget')
  })
})
