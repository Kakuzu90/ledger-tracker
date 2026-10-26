// Generates the PWA icon set from scratch (no image deps).
//
// Mark: a ledger line — a label on the left, its amount on the right, one
// of them posted in the warning tone. It is the shape of every list in the
// app, and it still reads at 48px, which a receipt or a coin does not.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const PRIMARY = [15, 110, 100] // --c-primary  #0F6E64
const INK = [255, 255, 255]
const WARNING = [217, 146, 43] // --c-warning  #D9922B

/** Samples per pixel per axis. Shapes here are all curves, so this matters. */
const SS = 4

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

/**
 * Averages an SSxSS grid inside each pixel. Without it every curve is a
 * staircase, which is what the first version of these icons looked like.
 */
const antialiased = (size, colourAt) =>
  png(size, (x, y) => {
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const [cr, cg, cb, ca] = colourAt(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)
        // Weight colour by coverage so edges do not darken toward black.
        r += cr * ca
        g += cg * ca
        b += cb * ca
        a += ca
      }
    }
    if (a === 0) return [0, 0, 0, 0]
    return [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / (SS * SS))]
  })

/** Point-in-rounded-rectangle, by clamping to the straight-edge core. */
const inRounded = (px, py, x, y, w, h, radius) => {
  if (px < x || py < y || px >= x + w || py >= y + h) return false
  const r = Math.min(radius, w / 2, h / 2)
  const cx = Math.min(Math.max(px, x + r), x + w - r)
  const cy = Math.min(Math.max(py, y + r), y + h - r)
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

/** A round-capped stroke between two points, for diagonals. */
const seg = (px, py, span, x0, y0, x1, y1, width) => {
  const ax = x0 * span
  const ay = y0 * span
  const bx = x1 * span
  const by = y1 * span
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2))
  const cx = ax + t * dx
  const cy = ay + t * dy
  const r = (width * span) / 2
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
}

/** A bar with fully round ends, in 0..1 coordinates within the mark box. */
const bar = (px, py, span, x0, y0, x1, y1) => {
  const h = (y1 - y0) * span
  return inRounded(px, py, x0 * span, y0 * span, (x1 - x0) * span, h, h / 2)
}

/**
 * @param {object} o
 * @param {boolean} o.bleed  Fill the whole square — what `purpose: maskable`
 *   needs. The platform applies its own mask, so an inset tile with
 *   transparent corners gets masked twice and leaves gaps around the art.
 * @param {number} o.markInset  Fraction of the canvas the mark spans.
 */
const icon = (size, { bleed, markInset, mark }) => {
  const tileRadius = size * 0.22
  const span = size * markInset
  const offset = (size - span) / 2

  return antialiased(size, (px, py) => {
    const onTile = bleed || inRounded(px, py, 0, 0, size, size, tileRadius)
    if (!onTile) return [0, 0, 0, 0]
    const ink = mark(px - offset, py - offset, span)
    return ink ? [...ink, 255] : [...PRIMARY, 255]
  })
}

// Label width per row, and what colour its amount is drawn in.
const ROWS = [
  [0.3, 0.4, INK],
  [0.455, 0.3, WARNING],
  [0.61, 0.44, INK],
]
const ROW_H = 0.09

/** The app mark: three ledger lines, the middle amount posted. */
const ledgerMark = (px, py, span) => {
  for (const [y, w, amountColour] of ROWS) {
    if (bar(px, py, span, 0.17, y, 0.17 + w, y + ROW_H)) return INK
    if (bar(px, py, span, 0.66, y, 0.83, y + ROW_H)) return amountColour
  }
  return null
}

/**
 * Shortcut glyphs (manifest `shortcuts`). Android draws these small and
 * often monochrome, so each is one bold shape rather than a scene.
 */
const plusMark = (px, py, span) =>
  bar(px, py, span, 0.435, 0.24, 0.565, 0.76) || bar(px, py, span, 0.24, 0.435, 0.76, 0.565)
    ? INK
    : null

const listMark = (px, py, span) => {
  for (const y of [0.29, 0.455, 0.62]) {
    if (bar(px, py, span, 0.2, y, 0.31, y + ROW_H)) return INK
    if (bar(px, py, span, 0.37, y, 0.8, y + ROW_H)) return INK
  }
  return null
}

/** Two arrows passing each other — money moving, as on the Loans tab. */
const transferMark = (px, py, span) => {
  const w = 0.1
  // Upper: runs right, head on the right.
  if (seg(px, py, span, 0.22, 0.375, 0.76, 0.375, w)) return INK
  if (seg(px, py, span, 0.62, 0.25, 0.77, 0.375, w)) return INK
  if (seg(px, py, span, 0.62, 0.5, 0.77, 0.375, w)) return INK
  // Lower: runs left, head on the left.
  if (seg(px, py, span, 0.24, 0.625, 0.78, 0.625, w)) return INK
  if (seg(px, py, span, 0.38, 0.5, 0.23, 0.625, w)) return INK
  if (seg(px, py, span, 0.38, 0.75, 0.23, 0.625, w)) return INK
  return null
}

const chartMark = (px, py, span) => {
  for (const [x, top] of [
    [0.28, 0.54],
    [0.455, 0.28],
    [0.63, 0.42],
  ]) {
    if (bar(px, py, span, x, top, x + 0.115, 0.74)) return INK
  }
  return null
}

const write = (name, buf) => {
  writeFileSync(`public/${name}`, buf)
  console.log(`  public/${name}`)
}

write('pwa-192x192.png', icon(192, { bleed: false, markInset: 0.86, mark: ledgerMark }))
write('pwa-512x512.png', icon(512, { bleed: false, markInset: 0.86, mark: ledgerMark }))
// Maskable art has to survive a circular crop: the safe zone is the inner
// 80%, so the mark spans 0.56 (half-diagonal 0.396, just inside 0.4).
write('pwa-maskable-192x192.png', icon(192, { bleed: true, markInset: 0.56, mark: ledgerMark }))
write('pwa-maskable-512x512.png', icon(512, { bleed: true, markInset: 0.56, mark: ledgerMark }))
// iOS rounds the corners itself and does not want alpha.
write('apple-touch-icon.png', icon(180, { bleed: true, markInset: 0.7, mark: ledgerMark }))

write('shortcut-add.png', icon(96, { bleed: false, markInset: 0.86, mark: plusMark }))
write('shortcut-activity.png', icon(96, { bleed: false, markInset: 0.86, mark: listMark }))
write('shortcut-loans.png', icon(96, { bleed: false, markInset: 0.86, mark: transferMark }))
write('shortcut-reports.png', icon(96, { bleed: false, markInset: 0.86, mark: chartMark }))
