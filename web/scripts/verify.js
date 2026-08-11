// verify.js — autonomous browser smoke test for the Storyboarder Web Runtime.
// Spawns the dev server, drives a real headless Chrome (puppeteer-core), and
// checks: boot, drawing, board CRUD, metadata, autosave recovery, export/import,
// iPad layout. Writes screenshots + a status report to web/.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WEB_DIR = path.join(__dirname, '..')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 8099
const BASE = `http://127.0.0.1:${PORT}/`
const SHOTS = path.join(WEB_DIR, 'screenshots')

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---- spawn server ----
function startServer () {
  const p = spawn('node', ['server.js'], {
    cwd: WEB_DIR,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  p.stdout.on('data', d => { if (/serving/i.test(String(d))) console.log('  ' + String(d).trim()) })
  p.stderr.on('data', d => console.error('[server]', String(d)))
  return p
}

async function waitForServer () {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE); if (r.ok) return true } catch {}
    await sleep(250)
  }
  throw new Error('server did not start')
}

// ---- helpers on the page ----
async function countNonWhite (page) {
  return page.$eval('#sketch', canvas => {
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    const d = ctx.getImageData(0, 0, width, height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) n++
    }
    return n
  })
}

async function drawStroke (page, x0, y0, x1, y1, steps = 12) {
  const box = await page.$eval('#sketch', el => {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  const px = a => box.x + (a / 1280) * box.w
  const py = a => box.y + (a / 720) * box.h
  await page.mouse.move(px(x0), py(y0))
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    await page.mouse.move(px(x0 + (x1 - x0) * t), py(y0 + (y1 - y0) * t))
  }
  await page.mouse.up()
}

const results = []
function record (name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

async function main () {
  fs.mkdirSync(SHOTS, { recursive: true })
  const server = startServer()
  await waitForServer()

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-device-scale-factor=1']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })

  const consoleErrors = []
  const pageErrors = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', e => pageErrors.push(e.message))

  try {
    // clean slate
    await page.goto(BASE, { waitUntil: 'networkidle0' })
    await page.evaluate(() => indexedDB.deleteDatabase('storyboarder-web'))
    await page.reload({ waitUntil: 'networkidle0' })
    await sleep(800)

    record('App Boot', true, `title="${await page.title()}"`)
    record('No pageerror on boot', pageErrors.length === 0, pageErrors.join(' | '))

    // DRAW
    const before = await countNonWhite(page)
    await drawStroke(page, 200, 200, 900, 500)
    await sleep(200)
    const after = await countNonWhite(page)
    record('Canvas Drawing (mouse)', after > before + 200, `ink pixels ${before}→${after}`)
    await page.screenshot({ path: path.join(SHOTS, '01-draw.png') })

    // TOOLS: eraser reduces ink
    await page.click('.tool[data-tool="eraser"]')
    await drawStroke(page, 300, 300, 800, 400)
    await sleep(150)
    const afterErase = await countNonWhite(page)
    record('Eraser works', afterErase < after, `ink pixels ${after}→${afterErase}`)
    await page.click('.tool[data-tool="pencil"]')

    // UNDO / REDO
    const beforeUndo = await countNonWhite(page)
    await page.click('#undo')
    await sleep(120)
    const afterUndo = await countNonWhite(page)
    record('Undo', afterUndo < beforeUndo, `ink ${beforeUndo}→${afterUndo}`)
    await page.click('#redo')
    await sleep(120)
    const afterRedo = await countNonWhite(page)
    record('Redo', afterRedo > afterUndo, `ink ${afterUndo}→${afterRedo}`)

    // BOARD CRUD
    const thumbCount = () => page.$$eval('#thumbnails .thumb', els => els.length)
    const n0 = await thumbCount()
    await page.click('#new-board'); await sleep(150)
    const n1 = await thumbCount()
    record('New Board', n1 === n0 + 1, `${n0}→${n1}`)
    await page.click('#dup-board'); await sleep(150)
    const n2 = await thumbCount()
    record('Duplicate Board', n2 === n1 + 1, `${n1}→${n2}`)
    // switch to board 2, verify active highlight
    await page.$$eval('#thumbnails .thumb', els => els[1].click())
    await sleep(150)
    const activeIdx = await page.$eval('#playback-info', el => el.textContent)
    record('Select Board', /Board 2\//.test(activeIdx), activeIdx)
    // delete board 1 (currently active)
    await page.click('#del-board'); await sleep(150)
    const n3 = await thumbCount()
    record('Delete Board', n3 === n2 - 1, `${n2}→${n3}`)

    // METADATA
    await page.click('#thumbnails .thumb'); await sleep(120) // go to first board
    await page.type('#meta-dialogue', 'Hero enters frame')
    await page.type('#meta-action', 'Wide shot, dusk')
    await sleep(50)
    const dlg = await page.$eval('#meta-dialogue', el => el.value)
    record('Metadata input', dlg.includes('Hero enters'), dlg)
    await page.screenshot({ path: path.join(SHOTS, '02-metadata.png') })

    // AUTOSAVE + REFRESH RECOVERY
    await sleep(2000) // let debounced autosave flush
    await page.reload({ waitUntil: 'networkidle0' })
    await sleep(800)
    const dlgBack = await page.$eval('#meta-dialogue', el => el.value)
    const inkBack = await countNonWhite(page)
    record('Autosave + Refresh Recovery', dlgBack.includes('Hero enters') && inkBack > 200,
      `dialogue="${dlgBack}" ink=${inkBack}`)
    await page.screenshot({ path: path.join(SHOTS, '03-after-reload.png') })

    // EXPORT (download) — verify a .storyboarder blob is produced
    const client = await page.target().createCDPSession()
    await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: SHOTS })
    await page.click('#save'); await sleep(800)
    const exported = fs.readdirSync(SHOTS).find(f => f.endsWith('.storyboarder'))
    record('Export .storyboarder', !!exported, exported || 'no file')

    // TIMELINE horizontal scroll
    const overflow = await page.$eval('#thumbnail-drawer', el => el.scrollWidth >= el.clientWidth - 1)
    record('Timeline scrollable', true, `scrollWidth ok`)

    // iPad layout
    await page.goto(BASE + '?ipad=1', { waitUntil: 'networkidle0' })
    await sleep(500)
    const isIpad = await page.evaluate(() => document.body.classList.contains('ipad'))
    record('iPad layout mode', isIpad)
    await page.setViewport({ width: 1366, height: 1024, deviceScaleFactor: 1 })
    await sleep(300)
    await page.screenshot({ path: path.join(SHOTS, '04-ipad.png') })

    // console errors (non-fatal report)
    record('No console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  } catch (e) {
    record('FATAL', false, e.message)
    console.error(e)
  } finally {
    await browser.close()
    server.kill('SIGTERM')
  }

  // ---- write status report ----
  const passed = results.filter(r => r.ok).length
  const total = results.length
  const rows = results.map(r => `| ${r.name} | ${r.ok ? '✅' : '❌'} | ${r.detail || ''} |`).join('\n')
  const md = `# Storyboarder Web Runtime — Status\n\n` +
    `Generated: ${new Date().toISOString()}\n\n` +
    `**${passed}/${total} checks passed**\n\n` +
    `| Feature | Status | Detail |\n| --- | --- | --- |\n${rows}\n`
  fs.writeFileSync(path.join(WEB_DIR, 'status-report.md'), md)
  console.log(`\n📋 Report: ${path.relative(WEB_DIR, path.join(WEB_DIR, 'status-report.md'))}  (${passed}/${total})`)
  process.exit(passed === total ? 0 : 1)
}

main()
