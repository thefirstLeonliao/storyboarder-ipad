// package-zip.js — bundle the dist/ static build into a single .zip deliverable.
// No dependencies: reuses the hand-rolled createZip from public/js/zip.js.
// Output: storyboarder-ipad-web-mvp.zip

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createZip } from '../public/js/zip.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, '..', 'dist')
const OUT = path.join(__dirname, '..', 'storyboarder-ipad-web-mvp.zip')

function walk (dir, entries, prefix = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory()) walk(full, entries, rel)
    else entries.push({ name: `storyboarder-ipad-web-mvp/${rel}`, data: new Uint8Array(fs.readFileSync(full)) })
  }
}

if (!fs.existsSync(DIST)) {
  console.error('dist/ does not exist. Run `npm run build:web` first.')
  process.exit(1)
}

const entries = []
walk(DIST, entries)
const blob = createZip(entries)
const buf = Buffer.from(await blob.arrayBuffer())
fs.writeFileSync(OUT, buf)
console.log(`✓ ${path.basename(OUT)}  (${entries.length} files, ${buf.length} bytes)`)
