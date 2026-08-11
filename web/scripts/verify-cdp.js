// verify-cdp.js — zero-dependency browser smoke test via Chrome DevTools Protocol.
// No npm packages needed: Node 22 has a global WebSocket. Drives the local
// headless Chrome to prove the Storyboarder Web Runtime actually works:
// boot, drawing, board CRUD, metadata, autosave recovery, export, iPad layout.
//
// Run with:  node scripts/verify-cdp.js   (after `npm run web` is available)

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WEB_DIR = path.join(__dirname, '..')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 8090
const BASE = `http://127.0.0.1:${PORT}/`
const SHOTS = path.join(WEB_DIR, 'screenshots')
const PROFILE = path.join(os.tmpdir(), 'sb-chrome-' + process.pid)

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---- minimal CDP client over a WebSocket (Node global WebSocket, Web-style) ----
class CDP {
  constructor (url) {
    this.ws = new WebSocket(url)
    this.id = 0
    this.pending = new Map()
    this.handlers = new Map()
    this.queue = []
    this.open = false
    this.ws.onopen = () => { this.open = true; this.queue.splice(0).forEach(m => this.ws.send(m)) }
    this.ws.onmessage = ev => this._onMessage(JSON.parse(ev.data))
  }
  _onMessage (msg) {
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id)
      this.pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    } else if (msg.method && this.handlers.has(msg.method)) {
      this.handlers.get(msg.method).forEach(cb => cb(msg.params))
    }
  }
  on (method, cb) { if (!this.handlers.has(method)) this.handlers.set(method, []); this.handlers.get(method).push(cb) }
  send (method, params = {}) {
    const id = ++this.id
    const payload = JSON.stringify({ id, method, params })
    return new Promise((resolve, reject) => {
      this._track(id, resolve, reject)
      if (this.open) this.ws.send(payload)
      else this.queue.push(payload)
    })
  }
  _track (id, resolve, reject) {
    this.pending.set(id, { resolve, reject })
    setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP timeout: ' + id)) } }, 20000)
  }
  async close () { try { this.ws.close() } catch {} }
}

// ---- server ----
function startServer () {
  const p = spawn('node', ['server.js'], {
    cwd: WEB_DIR,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  p.stderr.on('data', d => { if (/error/i.test(String(d))) console.error('[server]', String(d)) })
  return p
}
async function waitForServer () {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE); if (r.ok) return } catch {} await sleep(250) }
  throw new Error('server did not start')
}

// ---- chrome ----
async function launchChrome () {
  fs.rmSync(PROFILE, { recursive: true, force: true })
  fs.mkdirSync(PROFILE, { recursive: true })
  const proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=9222', `--user-data-dir=${PROFILE}`,
    '--window-size=1440,900', 'about:blank'
  ], { stdio: 'ignore' })
  // discover browser ws endpoint
  let info
  for (let i = 0; i < 40; i++) {
    try { info = await (await fetch('http://127.0.0.1:9222/json/version')).json(); if (info.webSocketDebuggerUrl) break } catch {}
    await sleep(250)
  }
  if (!info || !info.webSocketDebuggerUrl) throw new Error('chrome debugging endpoint not found')
  return { proc, wsUrl: info.webSocketDebuggerUrl }
}

// ---- helpers ----
async function canvasRect (page) {
  return page.send('Runtime.evaluate', {
    expression: `(() => { const r = document.querySelector('#sketch').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`,
    returnByValue: true
  }).then(r => r.result.value)
}
async function countNonWhite (page) {
  const r = await page.send('Runtime.evaluate', {
    expression: `(() => { const c=document.querySelector('#sketch'); const x=c.getContext('2d'); const d=x.getImageData(0,0,c.width,c.height).data; let n=0; for(let i=0;i<d.length;i+=4){ if(d[i]<250||d[i+1]<250||d[i+2]<250) n++; } return n; })()`,
    returnByValue: true
  })
  return r.result.value
}
async function drawStroke (page, x0, y0, x1, y1, steps = 12) {
  const b = await canvasRect(page)
  const px = a => b.x + (a / 1280) * b.w
  const py = a => b.y + (a / 720) * b.h
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px(x0), y: py(y0), button: 'left', clickCount: 1, pointerType: 'mouse' })
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px(x0 + (x1 - x0) * t), y: py(y0 + (y1 - y0) * t), pointerType: 'mouse' })
  }
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px(x1), y: py(y1), button: 'left', pointerType: 'mouse' })
}
async function clickSel (page, sel) {
  await page.send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(sel)}).click()`, returnByValue: true })
}
// Trusted click via real mouse events — required for the native file chooser
// to actually open (Runtime.evaluate-click is NOT a user gesture).
async function clickReal (page, sel) {
  const r = await page.send('Runtime.evaluate', {
    expression: `(() => { const el = document.querySelector(${JSON.stringify(sel)}); const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`,
    returnByValue: true
  })
  const { x, y } = r.result.value
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, pointerType: 'mouse' })
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, pointerType: 'mouse' })
}
async function evaluate (page, expr) {
  const r = await page.send('Runtime.evaluate', { expression: expr, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + (r.exceptionDetails.exception?.description || ''))
  return r.result.value
}
async function typeInto (page, sel, text) {
  await page.send('Runtime.evaluate', {
    expression: `(() => { const el=document.querySelector(${JSON.stringify(sel)}); el.value=''; el.focus(); el.value=${JSON.stringify(text)}; el.dispatchEvent(new Event('input', {bubbles:true})); })()`,
    returnByValue: true
  })
}
async function screenshot (page, file) {
  const r = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'))
}

const results = []
const record = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`) }

async function main () {
  fs.mkdirSync(SHOTS, { recursive: true })
  for (const f of fs.readdirSync(SHOTS)) { try { fs.rmSync(path.join(SHOTS, f), { force: true }) } catch {} }
  const server = startServer()
  await waitForServer()
  const chrome = await launchChrome()
  const browser = new CDP(chrome.wsUrl)

  const { targetId } = await browser.send('Target.createTarget', { url: BASE })
  const list = await (await fetch('http://127.0.0.1:9222/json/list')).json()
  const target = list.find(t => t.id === targetId)
  const page = new CDP(target.webSocketDebuggerUrl)

  await page.send('Page.enable')
  await page.send('Runtime.enable')

  const consoleErrors = []
  const pageErrors = []
  page.on('Runtime.consoleAPICalled', m => { if (m.type === 'error') { const txt = m.text || (m.args || []).map(a => (a.description ? a.description.split('\n').slice(0, 3).join(' | ') : (a.value ?? ''))).join(' '); consoleErrors.push(txt); console.log('  CONSOLE-ERR:', txt) } })
  page.on('Runtime.exceptionThrown', m => pageErrors.push(m.exceptionDetails?.exception?.description || m.exceptionDetails?.text))

  try {
    await page.send('Page.navigate', { url: BASE })
    await sleep(1500)
    // clean IndexedDB
    await page.send('Runtime.evaluate', { expression: `indexedDB.deleteDatabase('storyboarder-web')`, returnByValue: true })
    await page.send('Page.navigate', { url: BASE })
    await sleep(1500)

    record('App Boot', (await page.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })).result.value.includes('Storyboarder'))
    record('No pageerror on boot', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))

    // DRAW
    const before = await countNonWhite(page)
    await drawStroke(page, 200, 200, 900, 500)
    await sleep(200)
    const after = await countNonWhite(page)
    record('Canvas Drawing (mouse)', after > before + 200, `ink ${before}→${after}`)
    await screenshot(page, path.join(SHOTS, '01-draw.png'))

    // ERASER
    await clickSel(page, '.tool[data-tool="eraser"]')
    await drawStroke(page, 300, 300, 800, 400)
    await sleep(150)
    const afterErase = await countNonWhite(page)
    record('Eraser works', afterErase < after, `ink ${after}→${afterErase}`)
    await clickSel(page, '.tool[data-tool="pencil"]')

    // UNDO / REDO (draw-based, unambiguous direction)
    const beforeDraw = await countNonWhite(page)
    await drawStroke(page, 100, 120, 620, 360)
    await sleep(150)
    const afterDraw = await countNonWhite(page)
    record('Draw adds ink', afterDraw > beforeDraw, `ink ${beforeDraw}→${afterDraw}`)
    await clickSel(page, '#undo'); await sleep(150)
    const afterUndo = await countNonWhite(page)
    record('Undo', afterUndo < afterDraw, `ink ${afterDraw}→${afterUndo} (was ${beforeDraw})`)
    await clickSel(page, '#redo'); await sleep(150)
    const afterRedo = await countNonWhite(page)
    record('Redo', afterRedo > afterUndo, `ink ${afterUndo}→${afterRedo}`)

    // BOARD CRUD
    const thumbCount = async () => evaluate(page, `document.querySelectorAll('#thumbnails .thumb').length`)
    const n0 = await thumbCount()
    await clickSel(page, '#new-board'); await sleep(150)
    const n1 = await thumbCount()
    record('New Board', n1 === n0 + 1, `${n0}→${n1}`)
    await clickSel(page, '#dup-board'); await sleep(150)
    const n2 = await thumbCount()
    record('Duplicate Board', n2 === n1 + 1, `${n1}→${n2}`)
    await evaluate(page, `document.querySelectorAll('#thumbnails .thumb')[1].click()`); await sleep(150)
    const infoTxt = await evaluate(page, `document.querySelector('#playback-info').textContent`)
    record('Select Board', /Board 2\//.test(infoTxt), infoTxt)
    await clickSel(page, '#del-board'); await sleep(150)
    const n3 = await thumbCount()
    record('Delete Board', n3 === n2 - 1, `${n2}→${n3}`)

    // METADATA
    await evaluate(page, `document.querySelector('#thumbnails .thumb').click()`); await sleep(120)
    await typeInto(page, '#meta-dialogue', 'Hero enters frame')
    await typeInto(page, '#meta-action', 'Wide shot, dusk')
    await sleep(50)
    const dlg = await evaluate(page, `document.querySelector('#meta-dialogue').value`)
    record('Metadata input', dlg.includes('Hero enters'), dlg)
    await screenshot(page, path.join(SHOTS, '02-metadata.png'))

    // AUTOSAVE + REFRESH RECOVERY
    await sleep(2200)
    await page.send('Page.navigate', { url: BASE })
    await sleep(1800)
    const dlgBack = await evaluate(page, `document.querySelector('#meta-dialogue').value`)
    const inkBack = await countNonWhite(page)
    record('Autosave + Refresh Recovery', dlgBack.includes('Hero enters') && inkBack > 200, `dialogue="${dlgBack}" ink=${inkBack}`)
    await screenshot(page, path.join(SHOTS, '03-after-reload.png'))

    // EXPORT (intercept download via CDP)
    const dlDir = SHOTS
    await page.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir })
    await clickSel(page, '#save'); await sleep(1000)
    const exported = fs.readdirSync(SHOTS).find(f => f.endsWith('.storyboarder'))
    record('Export .storyboarder', !!exported, exported || 'no file')

    // PDF / PNG export
    await clickSel(page, '#export-pdf'); await sleep(1200)
    const pdfFile = fs.readdirSync(SHOTS).find(f => f.endsWith('.pdf'))
    record('Export PDF', !!pdfFile, pdfFile || 'no file')
    await clickSel(page, '#export-png'); await sleep(900)
    const pngFiles = fs.readdirSync(SHOTS).filter(f => f.startsWith('board-') && f.endsWith('.png'))
    record('Export PNG', pngFiles.length > 0, pngFiles.join(',') || 'no file')

    // ONION SKIN (ghost of previous board on a fresh empty board)
    await clickSel(page, '#new-board'); await sleep(150)
    const inkEmpty = await countNonWhite(page)
    await clickSel(page, '#onion'); await sleep(200)
    const inkOnion = await countNonWhite(page)
    record('Onion skin', inkOnion > inkEmpty, `ink ${inkEmpty}→${inkOnion}`)
    await clickSel(page, '#onion'); await sleep(150) // toggle off

    // REFERENCE LAYER
    await clickSel(page, '#clear'); await sleep(120)
    await page.send('Runtime.evaluate', {
      expression: `(() => { const c=document.createElement('canvas'); c.width=256;c.height=256; const x=c.getContext('2d'); x.fillStyle='#3366cc'; x.fillRect(40,40,180,180); const img=new Image(); img.onload=()=>{ window.sb.getScene().active.reference=img; window.sb.getEngine().render(); }; img.src=c.toDataURL('image/png'); })()`,
      returnByValue: true
    })
    await sleep(300)
    const inkRef = await countNonWhite(page)
    record('Reference layer', inkRef > 0, `ink=${inkRef}`)
    await clickSel(page, '#clear'); await sleep(120)

    // IMPORT ROUND-TRIP (real file-chooser path: inject the exported file)
    await page.send('DOM.enable')
    await page.send('Page.setInterceptFileChooserDialog', { enabled: true })
    const exportedPath = path.join(SHOTS, exported)
    let chooserHandled = false
    page.on('Page.fileChooserOpened', async (params) => {
      try {
        await page.send('DOM.setFileInputFiles', { files: [exportedPath], backendNodeId: params.backendNodeId })
        chooserHandled = true
      } catch (e) { console.log('  chooser error:', e.message) }
    })
    const preBoards = await evaluate(page, `window.sb.getScene().boards.length`)
    await clickReal(page, '#import')
    await sleep(2500)
    const impBoards = await evaluate(page, `window.sb.getScene().boards.length`)
    const impInk = await countNonWhite(page)
    record('Import round-trip', chooserHandled && impBoards === n3 && impInk > 200,
      `chooser=${chooserHandled} pre=${preBoards} exported=${n3} post=${impBoards} ink=${impInk}`)

    // iPad layout
    await page.send('Page.navigate', { url: BASE + '?ipad=1' })
    await sleep(800)
    const isIpad = await evaluate(page, `document.body.classList.contains('ipad')`)
    record('iPad layout mode', isIpad)
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 1024, deviceScaleFactor: 1, mobile: false })
    await sleep(300)
    await screenshot(page, path.join(SHOTS, '04-ipad.png'))

    record('No console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  } catch (e) {
    record('FATAL', false, e.message)
    console.error(e)
  } finally {
    await browser.close(); await page.close()
    try { chrome.proc.kill('SIGTERM') } catch {}
    try { server.kill('SIGTERM') } catch {}
  }

  const passed = results.filter(r => r.ok).length
  const total = results.length
  const rows = results.map(r => `| ${r.name} | ${r.ok ? '✅' : '❌'} | ${r.detail || ''} |`).join('\n')
  const md = `# Storyboarder Web Runtime — Status (CDP)\n\nGenerated: ${new Date().toISOString()}\n\n**${passed}/${total} checks passed**\n\n| Feature | Status | Detail |\n| --- | --- | --- |\n${rows}\n`
  fs.writeFileSync(path.join(WEB_DIR, 'status-report.md'), md)
  console.log(`\n📋 Report: status-report.md  (${passed}/${total})`)
  process.exit(passed === total ? 0 : 1)
}

main()
