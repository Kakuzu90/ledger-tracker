import { describe, expect, it } from 'vitest'
import { parseLaunchAction, withoutLaunchAction } from './launch'

describe('parseLaunchAction', () => {
  it('reads the shortcut the manifest points at', () => {
    expect(parseLaunchAction('?add=expense')).toEqual({
      kind: 'quick-add',
      type: 'expense',
    })
  })

  it('accepts the other two kinds of entry', () => {
    expect(parseLaunchAction('?add=income')?.type).toBe('income')
    expect(parseLaunchAction('?add=transfer')?.type).toBe('transfer')
  })

  it('has nothing to do with an ordinary launch', () => {
    expect(parseLaunchAction('')).toBeNull()
    expect(parseLaunchAction('?utm_source=somewhere')).toBeNull()
  })

  it('ignores a value it does not recognise', () => {
    // The URL is user-editable; an unknown word opens nothing rather than
    // a sheet in an undefined state.
    expect(parseLaunchAction('?add=everything')).toBeNull()
    expect(parseLaunchAction('?add=')).toBeNull()
  })
})

describe('withoutLaunchAction', () => {
  it('takes the parameter back out', () => {
    expect(withoutLaunchAction('/?add=expense')).toBe('/')
  })

  it('leaves the rest of the query alone', () => {
    expect(withoutLaunchAction('/activity?add=expense&q=rent')).toBe('/activity?q=rent')
  })

  it('keeps the path and the hash', () => {
    expect(withoutLaunchAction('/loans/person/7?add=expense#top')).toBe(
      '/loans/person/7#top',
    )
  })

  it('changes nothing when there was no parameter', () => {
    expect(withoutLaunchAction('/reports')).toBe('/reports')
  })
})
