// app.js — Storyboarder Web Runtime entry point.
// Wires the faithful UI to the Core scene model + drawing engine, and handles
// autosave (IndexedDB), import/export (.storyboarder), timeline & playback.

import { createDefaultScene, Scene } from './scene.js'
import { DrawingEngine, TOOLS } from './engine.js'
import { saveScene, loadScene, hasSavedProject } from './storage.js'
import { parseZip, buildStoryboarderBlob, createZip } from './zip.js'
import { buildPdf } from './pdf.js'

const PALETTE = ['#1a1a1a', '#ffffff', '#e03131', '#c2255c', '#f08c00',
  '#f1c40f', '#37b24d', '#0c8599', '#4263eb', '#ae3ec9']

const $ = sel => document.querySelector(sel)
const $$ = sel => Array.from(document.querySelectorAll(sel))

let scene, engine, playing = false, playTimer = null

// ---------- status ----------
function status (msg, type = 'ok', ttl = 2200) {
  const el = $('#status')
  el.textContent = msg
  el.className = `status-bar show ${type}`
  clearTimeout(status._t)
  if (ttl) status._t = setTimeout(() => el.classList.remove('show'), ttl)
}

// ---------- autosave ----------
let saveTimer = null
function scheduleAutosave () {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try { await saveScene(scene); status('Autosaved', 'ok', 1200) }
    catch (e) { status('Autosave failed: ' + e.message, 'err') }
  }, 1500)
}
window.addEventListener('pagehide', () => { try { saveScene(scene) } catch {} })
document.addEventListener('visibilitychange', () => { if (document.hidden) try { saveScene(scene) } catch {} })

// ---------- color swatches ----------
function buildSwatches () {
  const wrap = $('#color-swatches')
  wrap.innerHTML = ''
  PALETTE.forEach((c, i) => {
    const b = document.createElement('button')
    b.className = 'swatch' + (i === 0 ? ' active' : '')
    b.style.background = c
    b.title = c
    b.addEventListener('click', () => {
      $$('.swatch').forEach(s => s.classList.remove('active'))
      b.classList.add('active')
      engine.setColor(c)
    })
    wrap.appendChild(b)
  })
}

// ---------- tool selection ----------
function selectTool (tool) {
  engine.setTool(tool)
  $$('.tool').forEach(t => t.classList.toggle('active', t.dataset.tool === tool))
}

// ---------- metadata panel ----------
function fillMetadata () {
  const b = scene.active
  if (!b) return
  $('#meta-shot').value = b.shot.type === 'shot' ? 'shot' : 'none'
  $('#meta-duration').value = b.duration
  $('#meta-newshot').checked = !!b.newShot
  $('#meta-dialogue').value = b.dialogue
  $('#meta-action').value = b.action
  $('#meta-notes').value = b.notes
}

function bindMetadata () {
  const onInput = (key, parse) => e => {
    const b = scene.active
    if (!b) return
    b[key] = parse ? parse(e.target.value) : e.target.value
    if (key === 'duration') renderTimeline()
    scheduleAutosave()
  }
  $('#meta-shot').addEventListener('change', e => {
    const b = scene.active; if (!b) return
    b.shot = { ...b.shot, type: e.target.value === 'shot' ? 'shot' : 'none' }
    scheduleAutosave()
  })
  $('#meta-duration').addEventListener('input', onInput('duration', parseFloat))
  $('#meta-newshot').addEventListener('change', e => { scene.active.newShot = e.target.checked; scheduleAutosave() })
  $('#meta-dialogue').addEventListener('input', onInput('dialogue'))
  $('#meta-action').addEventListener('input', onInput('action'))
  $('#meta-notes').addEventListener('input', onInput('notes'))
}

// ---------- timeline ----------
function renderTimeline () {
  const wrap = $('#thumbnails')
  wrap.innerHTML = ''
  scene.boards.forEach((b, i) => {
    const t = document.createElement('div')
    t.className = 'thumb' + (i === scene.activeIndex() ? ' active' : '')
    t.draggable = true
    t.dataset.uid = b.uid
    const img = document.createElement('img')
    try { img.src = b.canvas.toDataURL('image/png') } catch { img.src = '' }
    const idx = document.createElement('span'); idx.className = 'idx'; idx.textContent = (i + 1)
    const dur = document.createElement('span'); dur.className = 'dur'; dur.textContent = (b.duration || 0).toFixed(1) + 's'
    t.appendChild(img); t.appendChild(idx); t.appendChild(dur)

    t.addEventListener('click', () => selectBoard(i))
    t.addEventListener('dragstart', e => { e.dataTransfer.setData('text/uid', b.uid); t.classList.add('drag-over') })
    t.addEventListener('dragend', () => t.classList.remove('drag-over'))
    t.addEventListener('dragover', e => { e.preventDefault(); t.classList.add('drag-over') })
    t.addEventListener('dragleave', () => t.classList.remove('drag-over'))
    t.addEventListener('drop', e => {
      e.preventDefault(); t.classList.remove('drag-over')
      const uid = e.dataTransfer.getData('text/uid')
      const to = i
      scene.moveBoard(uid, to)
      selectBoard(scene.activeIndex())
      renderTimeline(); scheduleAutosave()
    })
    wrap.appendChild(t)
  })
}

function selectBoard (i) {
  scene.setActive(i)
  engine.loadBoard()
  fillMetadata()
  $$('.thumb').forEach((t, k) => t.classList.toggle('active', k === i))
  updatePlaybackInfo()
}

// ---------- board ops ----------
function newBoard () { scene.addBoard(scene.active.uid); afterBoardChange() }
function dupBoard () { scene.duplicateBoard(scene.active.uid); afterBoardChange() }
function delBoard () {
  if (scene.boards.length <= 1) { status('Need at least one board', 'warn'); return }
  scene.deleteBoard(scene.active.uid); afterBoardChange()
}
function afterBoardChange () {
  engine.loadBoard(); fillMetadata(); renderTimeline(); updatePlaybackInfo(); scheduleAutosave()
}

// ---------- import / export ----------
async function boardPNG (b) {
  return new Promise(res => b.canvas.toBlob(async blob => res(blob ? await blob.arrayBuffer() : null), 'image/png'))
}

async function exportProject () {
  try {
    const blob = await buildStoryboarderBlob(scene, boardPNG)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (scene.name || 'storyboard') + '.storyboarder'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    status('Exported ' + a.download, 'ok')
  } catch (e) { status('Export failed: ' + e.message, 'err') }
}

async function importProject (file) {
  try {
    let sceneJSON = null
    const imagesByUid = new Map()

    if (/\.json$/i.test(file.name)) {
      sceneJSON = JSON.parse(await file.text())
    } else {
      const entries = await parseZip(file)
      const proj = entries.find(e => /Project\.storyboarder$/i.test(e.name)) ||
                   entries.find(e => /\.storyboarder$/i.test(e.name))
      if (!proj) throw new Error('No Project.storyboarder found in archive')
      sceneJSON = JSON.parse(new TextDecoder().decode(proj.data))

      for (const e of entries) {
        const m = e.name.match(/^boards\/([^/]+)\/images\/(ink|pencil|fill|tone|notes)\.png$/i)
        if (m) {
          const uid = m[1]
          const kind = m[2].toLowerCase()
          if (!imagesByUid.has(uid)) imagesByUid.set(uid, {})
          imagesByUid.get(uid)[kind] = e.data
        }
      }
    }

    const newScene = Scene.fromJSON(sceneJSON)
    // load drawing images
    await Promise.all(newScene.boards.map(async b => {
      const set = imagesByUid.get(b.uid) || {}
      const pick = set.ink || set.pencil || set.fill || set.tone || set.notes
      if (!pick) return
      const url = URL.createObjectURL(new Blob([pick]))
      await new Promise(res => {
        const img = new Image()
        img.onload = () => { b.canvas.getContext('2d').drawImage(img, 0, 0, b.canvas.width, b.canvas.height); URL.revokeObjectURL(url); res() }
        img.onerror = () => { URL.revokeObjectURL(url); res() }
        img.src = url
      })
    }))

    scene = newScene
    scene.setActive(0)
    engine.scene = scene
    engine.stacks.clear()
    engine.resizeToBoard()
    fillMetadata(); renderTimeline(); updatePlaybackInfo()
    status('Imported ' + (scene.boards.length) + ' boards', 'ok')
    scheduleAutosave()
  } catch (e) {
    status('Import failed: ' + e.message, 'err')
    console.error(e)
  }
}

// ---------- PNG / PDF / Images export ----------
function canvasToJpeg (canvas, quality = 0.9) {
  return new Promise(res => canvas.toBlob(b => b.arrayBuffer().then(ab => res(new Uint8Array(ab))), 'image/jpeg', quality))
}
function canvasToPngBlob (canvas) {
  return new Promise(res => canvas.toBlob(b => res(b), 'image/png'))
}
async function downloadBlob (blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function exportPng () {
  try {
    const b = scene.active
    const blob = await canvasToPngBlob(b.canvas)
    await downloadBlob(blob, `board-${b.uid.slice(0, 8)}.png`)
    status('Exported PNG', 'ok')
  } catch (e) { status('PNG export failed: ' + e.message, 'err') }
}

async function exportImages () {
  try {
    const entries = []
    for (const b of scene.boards) {
      const blob = await canvasToPngBlob(b.canvas)
      entries.push({ name: `boards/${b.uid}/images/ink.png`, data: new Uint8Array(await blob.arrayBuffer()) })
    }
    entries.push({ name: 'Project.storyboarder', data: new TextEncoder().encode(JSON.stringify(scene.toJSON(), null, 2)) })
    const zip = createZip(entries)
    await downloadBlob(zip, (scene.name || 'storyboard') + '-images.zip')
    status('Exported ' + scene.boards.length + ' board images', 'ok')
  } catch (e) { status('Images export failed: ' + e.message, 'err') }
}

async function exportPdf () {
  try {
    const pages = []
    for (let i = 0; i < scene.boards.length; i++) {
      const b = scene.boards[i]
      const jpeg = await canvasToJpeg(b.canvas)
      const lines = [
        `Board ${i + 1}/${scene.boards.length}` + (b.shot && b.shot.type === 'shot' ? '  [Shot]' : ''),
        `Duration: ${b.duration}s`,
        b.dialogue ? `Dialogue: ${b.dialogue}` : '',
        b.action ? `Action: ${b.action}` : '',
        b.notes ? `Notes: ${b.notes}` : ''
      ].filter(Boolean)
      pages.push({ jpeg, w: b.canvas.width, h: b.canvas.height, lines })
    }
    const blob = buildPdf(pages)
    await downloadBlob(blob, (scene.name || 'storyboard') + '.pdf')
    status('Exported PDF (' + pages.length + ' pages)', 'ok')
  } catch (e) { status('PDF export failed: ' + e.message, 'err') }
}

// ---------- playback ----------
function updatePlaybackInfo () {
  const b = scene.active
  $('#playback-info').textContent = `Board ${scene.activeIndex() + 1}/${scene.boards.length}` +
    (b ? ` · ${b.duration.toFixed(1)}s` : '')
}

function play () {
  if (playing) { stopPlay(); return }
  playing = true
  $('#play-toggle').classList.add('playing'); $('#play-toggle').textContent = '⏸ Pause'
  let i = scene.activeIndex()
  const step = () => {
    if (!playing) return
    selectBoard(i)
    const dur = (scene.boards[i].duration || 1) * 1000
    i++
    if (i >= scene.boards.length) { stopPlay(); return }
    playTimer = setTimeout(step, dur)
  }
  step()
}
function stopPlay () {
  playing = false; clearTimeout(playTimer)
  $('#play-toggle').classList.remove('playing'); $('#play-toggle').textContent = '▶ Play'
}

// ---------- keyboard ----------
function bindKeyboard () {
  window.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase()
    const inField = tag === 'input' || tag === 'textarea' || tag === 'select'
    const mod = e.ctrlKey || e.metaKey

    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? engine.redo() : engine.undo(); return }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); exportProject(); return }
    if (inField) return

    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); selectBoard(Math.max(0, scene.activeIndex() - 1)); break
      case 'ArrowRight': e.preventDefault(); selectBoard(Math.min(scene.boards.length - 1, scene.activeIndex() + 1)); break
      case ' ': e.preventDefault(); play(); break
      case 'Delete': case 'Backspace': e.preventDefault(); delBoard(); break
      case '1': selectTool('light-pencil'); break
      case '2': selectTool('pencil'); break
      case '3': selectTool('pen'); break
      case '4': selectTool('brush'); break
      case '5': selectTool('eraser'); break
    }
  })
}

// ---------- iPad preview ----------
function bindiPad () {
  $('#ipad-preview').addEventListener('click', () => {
    const on = document.body.classList.toggle('ipad')
    $('#ipad-preview').classList.toggle('active', on)
    status(on ? 'iPad layout preview ON (1366×1024)' : 'iPad layout OFF', 'ok', 1500)
  })
  const params = new URLSearchParams(location.search)
  if (params.get('ipad') === '1') { document.body.classList.add('ipad'); $('#ipad-preview').classList.add('active') }
}

// ---------- reference image ----------
function bindReference () {
  $('#reference').addEventListener('click', () => $('#reference-file').click())
  $('#reference-file').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => { scene.active.reference = img; engine.render(); status('Reference loaded', 'ok') }
    img.src = url
    e.target.value = ''
  })
}

// ---------- init ----------
async function init () {
  const canvas = $('#sketch')
  // load saved or default
  let loaded = null
  try { if (await hasSavedProject()) loaded = await loadScene() } catch (e) { console.warn('load failed', e) }
  scene = loaded || createDefaultScene()
  scene.setActive(scene._active != null ? scene._active : 0)

  engine = new DrawingEngine(canvas, scene, {
    onChange: () => { scheduleAutosave(); renderTimeline() },
    onActivity: () => { const h = $('#sketch-hint'); if (h) h.style.display = 'none' }
  })

  // hide hint after first stroke too
  canvas.addEventListener('pointerdown', () => { const h = $('#sketch-hint'); if (h) h.style.display = 'none' })

  buildSwatches()
  bindMetadata()
  bindKeyboard()
  bindiPad()
  bindReference()

  // toolbar tools
  $$('.tool').forEach(t => t.addEventListener('click', () => selectTool(t.dataset.tool)))
  selectTool('pencil')

  // size
  const size = $('#brush-size')
  size.addEventListener('input', () => { engine.setSize(+size.value); $('#brush-size-label').textContent = size.value })

  // edit buttons
  $('#undo').addEventListener('click', () => engine.undo())
  $('#redo').addEventListener('click', () => engine.redo())
  $('#clear').addEventListener('click', () => engine.clear())
  $('#onion').addEventListener('click', () => {
    const on = !engine.onionEnabled; engine.setOnion(on); $('#onion').classList.toggle('active', on)
  })

  // board buttons
  $('#new-board').addEventListener('click', newBoard)
  $('#dup-board').addEventListener('click', dupBoard)
  $('#del-board').addEventListener('click', delBoard)

  // file
  $('#save').addEventListener('click', exportProject)
  $('#import').addEventListener('click', () => $('#import-file').click())
  $('#import-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) importProject(f); e.target.value = '' })
  $('#export-pdf').addEventListener('click', exportPdf)
  $('#export-png').addEventListener('click', exportPng)
  $('#export-images').addEventListener('click', exportImages)

  // playback
  $('#play-toggle').addEventListener('click', play)
  $('#play-prev').addEventListener('click', () => selectBoard(Math.max(0, scene.activeIndex() - 1)))
  $('#play-next').addEventListener('click', () => selectBoard(Math.min(scene.boards.length - 1, scene.activeIndex() + 1)))

  $('#project-title').textContent = scene.name

  engine.loadBoard()
  fillMetadata()
  renderTimeline()
  updatePlaybackInfo()
  status(loaded ? 'Restored autosaved project' : 'New project ready — draw something!', 'ok')

  // debug/embedding handle (used by automated verification & host apps)
  window.sb = {
    importProject, exportProject, exportPdf, exportPng, exportImages,
    getScene: () => scene,
    getEngine: () => engine,
    createDefaultScene
  }
}

init()
