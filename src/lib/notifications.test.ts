import { describe, expect, it } from 'vitest'
import { notificationState, notify, reminderText } from './notifications'

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
