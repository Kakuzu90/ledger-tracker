/**
 * Turning bytes into things JSON and the DOM can carry, and back.
 *
 * Shared by the backup file (receipt blobs, ciphertext) and the PIN (salt
 * and hash), which are the two places in the app that hold raw bytes.
 */

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  // Chunked: spreading a megabyte of receipt into fromCharCode overflows
  // the argument stack.
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** base64url, which is what WebAuthn credential ids travel as. */
export const bytesToBase64Url = (bytes: Uint8Array): string =>
  bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function base64UrlToBytes(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  return base64ToBytes(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
}

/**
 * A blob's bytes. `Blob.arrayBuffer()` is the direct route; the reader is
 * there for Safari before 14 — and for jsdom, whose Blob is the same vintage.
 */
export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob?.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer())
  }
  if (!(blob instanceof Blob)) throw new TypeError('That is not a readable file')

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that file'))
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.readAsArrayBuffer(blob)
  })
}

/**
 * Compares two equal-length byte strings without leaking where they first
 * differ through how long the comparison took.
 */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number)
  return diff === 0
}
