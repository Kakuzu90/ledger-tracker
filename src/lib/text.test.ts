import { describe, expect, it } from 'vitest'
import { abbreviate, firstName, sentenceCase } from './text'

describe('abbreviate', () => {
  it.each([
    ['Transport', 'Tr'],
    ['Car loan', 'CL'],
    ['Juan Dela Cruz', 'JD'],
    ['食費', '食費'],
  ])('shortens %s to %s', (name, expected) => {
    expect(abbreviate(name)).toBe(expected)
  })

  it('copes with the padding around a name', () => {
    expect(abbreviate('  Maria Santos  ')).toBe('MS')
  })
})

describe('firstName', () => {
  it.each([
    ['Juan Dela Cruz', 'Juan'],
    ['Ana', 'Ana'],
    ['  Ken Reyes', 'Ken'],
  ])('takes %s down to %s', (name, expected) => {
    expect(firstName(name)).toBe(expected)
  })
})

describe('sentenceCase', () => {
  it('lowercases a capitalised word so it reads mid-sentence', () => {
    expect(sentenceCase('Concert tickets')).toBe('concert tickets')
  })

  it('leaves an acronym alone', () => {
    expect(sentenceCase('MRT load')).toBe('MRT load')
    expect(sentenceCase('BDO car loan')).toBe('BDO car loan')
  })

  it('leaves something already lowercase alone', () => {
    expect(sentenceCase('phone repair')).toBe('phone repair')
    expect(sentenceCase('iPhone screen')).toBe('iPhone screen')
  })

  it('copes with a single character and an empty string', () => {
    expect(sentenceCase('A')).toBe('a')
    expect(sentenceCase('')).toBe('')
  })
})
