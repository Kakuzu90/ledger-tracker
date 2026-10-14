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
// `mark` is painted in ink over the tile, in tile-local coordinates.
const tileIcon = (size, inset, mark) => {
  const pad = Math.round(size * inset)
  const tile = size - pad * 2
  const radius = tile * 0.22

  const inTile = (lx, ly) => {
    if (lx < 0 || ly < 0 || lx >= tile || ly >= tile) return false
    const cx = Math.min(Math.max(lx, radius), tile - radius)
    const cy = Math.min(Math.max(ly, radius), tile - radius)
    const dx = lx - cx
    const dy = ly - cy
    return dx * dx + dy * dy <= radius * radius
  }

  return png(size, (x, y) => {
    const lx = x - pad
    const ly = y - pad
    if (!inTile(lx, ly)) return [0, 0, 0, 0]
    return mark(lx, ly, tile) ? [...INK, 255] : [...PRIMARY, 255]
  })
}

const rect = (lx, ly, x0, y0, w, h) => lx >= x0 && lx < x0 + w && ly >= y0 && ly < y0 + h

/** Three ledger rows, the top one shortened — the app mark. */
const ledgerMark = (lx, ly, tile) => {
  const barH = Math.max(2, Math.round(tile * 0.085))
  const gap = Math.round(tile * 0.105)
  const left = Math.round(tile * 0.24)
  const top = Math.round(tile * 0.3)
  return [0.34, 0.52, 0.52].some((w, i) =>
    rect(lx, ly, left, top + i * (barH + gap), Math.round(tile * w), barH),
  )
}

/**
 * Shortcut glyphs (manifest `shortcuts`). Android draws these small and
 * often monochrome, so each is one bold shape rather than a scene.
 */
const plusMark = (lx, ly, tile) => {
  const t = Math.round(tile * 0.12)
  const len = Math.round(tile * 0.46)
  const c = tile / 2
  return (
    rect(lx, ly, c - len / 2, c - t / 2, len, t) ||
    rect(lx, ly, c - t / 2, c - len / 2, t, len)
  )
}

const listMark = (lx, ly, tile) => {
  const barH = Math.max(2, Math.round(tile * 0.1))
  const gap = Math.round(tile * 0.11)
  const left = Math.round(tile * 0.27)
  const top = Math.round(tile * 0.29)
  const width = Math.round(tile * 0.46)
  return [0, 1, 2].some((i) => rect(lx, ly, left, top + i * (barH + gap), width, barH))
}

const peopleMark = (lx, ly, tile) => {
  const r = tile * 0.13
  const circle = (cx, cy) => (lx - cx) ** 2 + (ly - cy) ** 2 <= r * r
  return circle(tile * 0.37, tile * 0.42) || circle(tile * 0.63, tile * 0.58)
}

const chartMark = (lx, ly, tile) => {
  const w = Math.round(tile * 0.11)
  const gap = Math.round(tile * 0.07)
  const base = Math.round(tile * 0.72)
  const left = Math.round(tile * 0.28)
  return [0.2, 0.34, 0.26].some((h, i) => {
    const height = Math.round(tile * h)
    return rect(lx, ly, left + i * (w + gap), base - height, w, height)
  })
}

writeFileSync('public/pwa-192x192.png', tileIcon(192, 0.02, ledgerMark))
writeFileSync('public/pwa-512x512.png', tileIcon(512, 0.02, ledgerMark))
// Maskable art has to survive a circular crop, so the tile sits further in.
writeFileSync('public/pwa-maskable-192x192.png', tileIcon(192, 0.14, ledgerMark))
writeFileSync('public/pwa-maskable-512x512.png', tileIcon(512, 0.14, ledgerMark))
writeFileSync('public/apple-touch-icon.png', tileIcon(180, 0, ledgerMark))

writeFileSync('public/shortcut-add.png', tileIcon(96, 0.02, plusMark))
writeFileSync('public/shortcut-activity.png', tileIcon(96, 0.02, listMark))
writeFileSync('public/shortcut-loans.png', tileIcon(96, 0.02, peopleMark))
writeFileSync('public/shortcut-reports.png', tileIcon(96, 0.02, chartMark))

console.log('icons written to public/')
