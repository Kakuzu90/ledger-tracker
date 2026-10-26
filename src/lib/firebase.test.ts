import { describe, expect, it } from 'vitest'
import { missingConfig } from './firebase'

const full = {
  apiKey: 'k',
  authDomain: 'a',
  projectId: 'p',
  storageBucket: 's',
  messagingSenderId: 'm',
  appId: 'i',
}

describe('missingConfig', () => {
  it('passes a complete config', () => {
    expect(missingConfig(full)).toEqual([])
  })

  it('does not require measurementId, which only Analytics uses', () => {
    expect(missingConfig({ ...full, measurementId: undefined })).toEqual([])
  })

  it('names every key that is absent', () => {
    expect(missingConfig({ apiKey: 'k', projectId: 'p' }).sort()).toEqual([
      'appId',
      'authDomain',
      'messagingSenderId',
      'storageBucket',
    ])
  })

  it('treats a blank or whitespace value as missing', () => {
    // What an untouched `.env.example` copied to `.env` actually looks
    // like — the key is there, the value is not.
    expect(missingConfig({ ...full, apiKey: '' })).toEqual(['apiKey'])
    expect(missingConfig({ ...full, projectId: '   ' })).toEqual(['projectId'])
  })

  it('reports everything for an empty config, so the app stays local-only', () => {
    expect(missingConfig({})).toHaveLength(6)
  })
})
