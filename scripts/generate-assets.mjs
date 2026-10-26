import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

const root = new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1)).replaceAll('/', '\\')

const glyphs = {
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const kind = Buffer.from(type)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([kind, data])), 0)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  return Buffer.concat([length, kind, data, checksum])
}

function roundedRect(x, y, width, height, radius, px, py) {
  if (px >= x + radius && px <= x + width - radius) return py >= y && py <= y + height
  if (py >= y + radius && py <= y + height - radius) return px >= x && px <= x + width
  const cx = px < x + radius ? x + radius : x + width - radius
  const cy = py < y + radius ? y + radius : y + height - radius
  return (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2
}

function makePng(size, compact = false) {
  const pixels = Buffer.alloc(size * size * 4)
  const scale = size / 256
  const margin = Math.max(1, Math.round(size * 0.025))
  const radius = Math.round(size * 0.18)
  const glyph = compact ? 'C' : 'CODEX'
  const cell = compact ? Math.max(1, Math.floor(size / 11)) : Math.max(1, Math.floor(size / 38))
  const glyphWidth = glyph.length * 5 * cell + (glyph.length - 1) * cell
  const glyphHeight = 7 * cell
  const startX = Math.round((size - glyphWidth) / 2)
  const startY = Math.round((size - glyphHeight) / 2)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const inside = roundedRect(margin, margin, size - margin * 2, size - margin * 2, radius, x, y)
      if (!inside) {
        pixels[offset + 3] = 0
        continue
      }
      pixels[offset] = 18
      pixels[offset + 1] = 25
      pixels[offset + 2] = 43
      pixels[offset + 3] = 255
      const gx = x - startX
      const gy = y - startY
      const charIndex = Math.floor(gx / (6 * cell))
      const localX = gx % (6 * cell)
      const col = Math.floor(localX / cell)
      const row = Math.floor(gy / cell)
      if (charIndex >= 0 && charIndex < glyph.length && col >= 0 && col < 5 && row >= 0 && row < 7 && glyphs[glyph[charIndex]][row][col] === '1') {
        pixels[offset] = 248
        pixels[offset + 1] = 250
        pixels[offset + 2] = 252
      }
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(0x89504e47, 0)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const rows = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y += 1) {
    rows[y * (size * 4 + 1)] = 0
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function makeIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const entries = []
  let offset = 6 + images.length * 16
  for (const [size, data] of images) {
    const entry = Buffer.alloc(16)
    entry[0] = size === 256 ? 0 : size
    entry[1] = size === 256 ? 0 : size
    entry[2] = 0
    entry[3] = 0
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += data.length
  }
  return Buffer.concat([header, ...entries, ...images.map(([, data]) => data)])
}

await mkdir(join(root, 'assets'), { recursive: true })
await mkdir(join(root, 'build'), { recursive: true })
const tray16 = makePng(16, true)
const tray32 = makePng(32, true)
await writeFile(join(root, 'assets', 'tray.png'), tray16)
await writeFile(join(root, 'assets', 'tray@2x.png'), tray32)
await writeFile(join(root, 'assets', 'codex.png'), makePng(256))
const sizes = [16, 24, 32, 48, 64, 128, 256]
await writeFile(join(root, 'build', 'icon.ico'), makeIco(sizes.map((size) => [size, makePng(size)])))
