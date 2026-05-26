#!/usr/bin/env node
// scripts/build-bridge-zip.mjs
//
// Rebuilds public/downloads/ignyous-bridge-baseline.zip from the plugin source.
// Pure Node — no dependencies. Uses the ZIP "store" method (no compression) for simplicity;
// the plugin is tiny (~20 KB) so this is fine.
//
// Run:   node scripts/build-bridge-zip.mjs
// Or:    npm run build:plugin

import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC  = join(ROOT, 'plugin', 'ignyous-bridge-baseline')
const OUT  = join(ROOT, 'public', 'downloads', 'ignyous-bridge-baseline.zip')

// ── CRC32 ──────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

// ── Walk source dir ────────────────────────────────────────────────
function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.DS_Store' || name === 'node_modules') continue
    const full = join(dir, name)
    const st   = statSync(full)
    if (st.isDirectory()) walk(full, files)
    else files.push(full)
  }
  return files
}

// ── Build ──────────────────────────────────────────────────────────
const files = walk(SRC).sort()
const entries = []
const localParts = []
let offset = 0

for (const path of files) {
  const data = readFileSync(path)
  const name = relative(join(ROOT, 'plugin'), path).split(sep).join('/')
  const nameBuf = Buffer.from(name, 'utf8')
  const crc   = crc32(data)
  const size  = data.length

  // Local file header (30 bytes + name + data)
  const lfh = Buffer.alloc(30)
  lfh.writeUInt32LE(0x04034b50, 0)
  lfh.writeUInt16LE(20, 4)        // version needed
  lfh.writeUInt16LE(0, 6)         // flags
  lfh.writeUInt16LE(0, 8)         // method = store
  lfh.writeUInt16LE(0, 10)        // mod time
  lfh.writeUInt16LE(0x21, 12)     // mod date = 1980-01-01 (smallest legal)
  lfh.writeUInt32LE(crc, 14)
  lfh.writeUInt32LE(size, 18)
  lfh.writeUInt32LE(size, 22)
  lfh.writeUInt16LE(nameBuf.length, 26)
  lfh.writeUInt16LE(0, 28)        // extra
  localParts.push(lfh, nameBuf, data)
  entries.push({ name: nameBuf, crc, size, offset })
  offset += 30 + nameBuf.length + size
}

// Central directory
const cdParts = []
let cdSize = 0
for (const e of entries) {
  const cd = Buffer.alloc(46)
  cd.writeUInt32LE(0x02014b50, 0)
  cd.writeUInt16LE(20, 4)         // version made by
  cd.writeUInt16LE(20, 6)         // version needed
  cd.writeUInt16LE(0, 8)
  cd.writeUInt16LE(0, 10)
  cd.writeUInt16LE(0, 12)
  cd.writeUInt16LE(0x21, 14)
  cd.writeUInt32LE(e.crc, 16)
  cd.writeUInt32LE(e.size, 20)
  cd.writeUInt32LE(e.size, 24)
  cd.writeUInt16LE(e.name.length, 28)
  cd.writeUInt16LE(0, 30)
  cd.writeUInt16LE(0, 32)
  cd.writeUInt16LE(0, 34)
  cd.writeUInt16LE(0, 36)
  cd.writeUInt32LE(0, 38)
  cd.writeUInt32LE(e.offset, 42)
  cdParts.push(cd, e.name)
  cdSize += 46 + e.name.length
}

// EOCD
const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0)
eocd.writeUInt16LE(0, 4)
eocd.writeUInt16LE(0, 6)
eocd.writeUInt16LE(entries.length, 8)
eocd.writeUInt16LE(entries.length, 10)
eocd.writeUInt32LE(cdSize, 12)
eocd.writeUInt32LE(offset, 16)
eocd.writeUInt16LE(0, 20)

mkdirSync(join(ROOT, 'public', 'downloads'), { recursive: true })
writeFileSync(OUT, Buffer.concat([...localParts, ...cdParts, eocd]))

console.log(`Built ${OUT} — ${entries.length} files`)
