// build.js — zero-dependency static build: copy public/ -> dist/.
// The app is authored as native ES modules, so the web build is just the
// static files. Run with:  npm run build:web
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const src = path.join(root, 'public')
const dst = path.join(root, 'dist')

function copyDir (from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name)
    const d = path.join(to, e.name)
    if (e.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

let count = 0
function countFiles (dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) countFiles(path.join(dir, e.name))
    else count++
  }
}

fs.rmSync(dst, { recursive: true, force: true })
copyDir(src, dst)
countFiles(dst)

console.log(`✓ build:web -> ${path.relative(root, dst)}  (${count} files)`)
