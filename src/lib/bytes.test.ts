import { describe, expect, it } from 'vitest'
import {
  base64ToBytes,
  base64UrlToBytes,
  blobToBytes,
  bytesToBase64,
  bytesToBase64Url,
  equalBytes,
} from './bytes'

describe('base64', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 42])
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('handles more bytes than fit in one call stack', () => {
    const big = new Uint8Array(200_000).map((_, i) => i % 256)
    expect(base64ToBytes(bytesToBase64(big))).toEqual(big)
  })

  it('has nothing to say about nothing', () => {
    expect(bytesToBase64(new Uint8Array())).toBe('')
    expect(base64ToBytes('')).toEqual(new Uint8Array())
  })
})

describe('base64url', () => {
  it('uses the url alphabet and drops the padding', () => {
    // 0xFB 0xFF encodes to "+/8=" in standard base64.
    const text = bytesToBase64Url(new Uint8Array([251, 255]))
    expect(text).not.toMatch(/[+/=]/)
  })

  it('round-trips, padding or no padding', () => {
    for (const length of [1, 2, 3, 4, 5, 17]) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 37 + 200) % 256)
      expect(base64UrlToBytes(bytesToBase64Url(bytes)), `${length} bytes`).toEqual(bytes)
    }
  })
})

describe('blobToBytes', () => {
  it('reads a blob', async () => {
    const bytes = Uint8Array.from([137, 80, 78, 71])
    expect(await blobToBytes(new Blob([bytes]))).toEqual(bytes)
  })

  it('refuses something that is not a blob at all', async () => {
    await expect(blobToBytes({} as Blob)).rejects.toThrow('not a readable file')
  })
})

describe('equalBytes', () => {
  it('matches identical bytes', () => {
    expect(equalBytes(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 2, 3]))).toBe(true)
  })

  it('rejects a difference anywhere, first byte or last', () => {
    expect(equalBytes(Uint8Array.from([9, 2, 3]), Uint8Array.from([1, 2, 3]))).toBe(false)
    expect(equalBytes(Uint8Array.from([1, 2, 9]), Uint8Array.from([1, 2, 3]))).toBe(false)
  })

  it('rejects a different length', () => {
    expect(equalBytes(Uint8Array.from([1, 2]), Uint8Array.from([1, 2, 3]))).toBe(false)
  })
})
