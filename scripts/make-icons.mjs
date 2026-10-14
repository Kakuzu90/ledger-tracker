// Generates the PWA icon set from scratch (no image deps).
// Mark: three ledger rows on the primary tile, the top row shortened.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const PRIMARY = [15, 110, 100]
const INK = [255, 255, 255]

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** @param {(x:number,y:number)=>[number,number,number,number]} shade */
function png(size, shade) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  let p = 0
  for (let y = 0; y < size; y++) {
    raw[p++] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = shade(x, y)
      raw[p++] = r
      raw[p++] = g
      raw[p++] = b
      raw[p++] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// inset: fraction of the canvas left empty around the tile (maskable safe zone).
const icon = (size, inset) => {
  const pad = Math.round(size * inset)
  const tile = size - pad * 2
  const radius = tile * 0.22
  const barH = Math.max(2, Math.round(tile * 0.085))
  const gap = Math.round(tile * 0.105)
  const left = pad + Math.round(tile * 0.24)
  const top = pad + Math.round(tile * 0.3)
  const widths = [0.34, 0.52, 0.52].map((w) => Math.round(tile * w))

  const inTile = (x, y) => {
    const lx = x - pad
    const ly = y - pad
    if (lx < 0 || ly < 0 || lx >= tile || ly >= tile) return false
    const cx = Math.min(Math.max(lx, radius), tile - radius)
    const cy = Math.min(Math.max(ly, radius), tile - radius)
    const dx = lx - cx
    const dy = ly - cy
    return dx * dx + dy * dy <= radius * radius
  }

  const onBar = (x, y) => {
    for (let i = 0; i < widths.length; i++) {
      const y0 = top + i * (barH + gap)
      if (y >= y0 && y < y0 + barH && x >= left && x < left + widths[i]) return true
    }
    return false
  }

  return png(size, (x, y) => {
    if (!inTile(x, y)) return [0, 0, 0, 0]
    return onBar(x, y) ? [...INK, 255] : [...PRIMARY, 255]
  })
}

writeFileSync('public/pwa-192x192.png', icon(192, 0.02))
writeFileSync('public/pwa-512x512.png', icon(512, 0.02))
writeFileSync('public/pwa-maskable-512x512.png', icon(512, 0.14))
writeFileSync('public/apple-touch-icon.png', icon(180, 0))
console.log('icons written to public/')
