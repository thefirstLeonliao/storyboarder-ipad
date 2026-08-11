// scene.js — Storyboarder Core data model.
// Faithful to upstream models/board.js schema (version 2.0.1) so that
// .storyboarder projects stay compatible with the desktop app.

export const SCHEMA_VERSION = '2.0.1'

// Layer names in canonical stacking order (bottom -> top), per board.js.
export const LAYER_NAMES = [
  'shot-generator', 'reference', 'fill', 'tone', 'pencil', 'ink', 'notes'
]

const HEX = '0123456789abcdef'
export function uidGen () {
  let uid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return HEX[v]
  })
  return uid
}

const BOARD_W = 1280 // internal render width (16:9 default)

export function makeCanvas (w = BOARD_W, h = Math.round(BOARD_W / (16 / 9))) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
}

export function defaultShot () {
  return {
    type: 'none',
    constraints: { position: true, rotation: true, scale: true, shotType: true },
    shotGeneratorBoardUid: null,
    layers: {}
  }
}

export class Board {
  constructor (opts = {}) {
    this.uid = opts.uid || uidGen()
    this.shot = opts.shot || defaultShot()
    this.duration = opts.duration != null ? opts.duration : 2.0
    this.dialogue = opts.dialogue || ''
    this.action = opts.action || ''
    this.notes = opts.notes || ''
    this.newShot = opts.newShot || false
    this.fps = opts.fps || 24
    // pixel data lives on an offscreen canvas
    this.canvas = opts.canvas || makeCanvas()
    // optional overlays
    this.reference = opts.reference || null // Image or null
    this.referenceOpacity = 1
  }

  clone () {
    const c = makeCanvas(this.canvas.width, this.canvas.height)
    c.getContext('2d').drawImage(this.canvas, 0, 0)
    return new Board({
      uid: uidGen(),
      shot: JSON.parse(JSON.stringify(this.shot)),
      duration: this.duration,
      dialogue: this.dialogue,
      action: this.action,
      notes: this.notes,
      newShot: this.newShot,
      fps: this.fps,
      canvas: c,
      reference: this.reference
    })
  }

  toJSON (index, defaultBoardTiming) {
    const time = index * (this.duration || defaultBoardTiming || 2.0)
    return {
      uid: this.uid,
      url: 'images/ink.png',
      shot: this.shot,
      time,
      layers: LAYER_NAMES.map(name => {
        const visible = name !== 'shot-generator'
        const path = (name === 'ink') ? 'images/ink.png' : null
        return { name, path, visible, opacity: 1 }
      }),
      duration: this.duration,
      dialogue: this.dialogue,
      action: this.action,
      notes: this.notes,
      newShot: this.newShot
    }
  }
}

export class Scene {
  constructor (opts = {}) {
    this.version = SCHEMA_VERSION
    this.name = opts.name || 'Untitled'
    this.aspectRatio = opts.aspectRatio || (16 / 9)
    this.fps = opts.fps || 24
    this.defaultBoardTiming = opts.defaultBoardTiming || 2.0
    this.boards = opts.boards || []
  }

  get width () { return BOARD_W }
  get height () { return Math.round(BOARD_W / this.aspectRatio) }

  activeIndex () { return this._active != null ? this._active : 0 }
  get active () { return this.boards[this.activeIndex()] || null }
  setActive (i) { this._active = Math.max(0, Math.min(this.boards.length - 1, i)) }

  addBoard (afterUid) {
    const b = new Board({ duration: this.defaultBoardTiming, fps: this.fps })
    if (afterUid == null) {
      this.boards.push(b)
      this._active = this.boards.length - 1
    } else {
      const idx = this.boards.findIndex(x => x.uid === afterUid)
      this.boards.splice(idx + 1, 0, b)
      this._active = idx + 1
    }
    return b
  }

  duplicateBoard (uid) {
    const idx = this.boards.findIndex(x => x.uid === uid)
    if (idx < 0) return null
    const copy = this.boards[idx].clone()
    this.boards.splice(idx + 1, 0, copy)
    this._active = idx + 1
    return copy
  }

  deleteBoard (uid) {
    const idx = this.boards.findIndex(x => x.uid === uid)
    if (idx < 0) return
    this.boards.splice(idx, 1)
    if (this.boards.length === 0) this.boards.push(new Board({ duration: this.defaultBoardTiming }))
    if (this._active >= this.boards.length) this._active = this.boards.length - 1
  }

  moveBoard (uid, toIndex) {
    const from = this.boards.findIndex(x => x.uid === uid)
    if (from < 0) return
    const [b] = this.boards.splice(from, 1)
    toIndex = Math.max(0, Math.min(this.boards.length, toIndex))
    this.boards.splice(toIndex, 0, b)
    this._active = this.boards.indexOf(b)
  }

  toJSON () {
    return {
      version: this.version,
      name: this.name,
      aspectRatio: this.aspectRatio,
      fps: this.fps,
      defaultBoardTiming: this.defaultBoardTiming,
      boards: this.boards.map((b, i) => b.toJSON(i, this.defaultBoardTiming))
    }
  }

  // Build a Scene from a parsed Storyboarder project JSON (import).
  static fromJSON (data) {
    const s = new Scene({
      name: data.name || 'Imported',
      aspectRatio: data.aspectRatio || (16 / 9),
      fps: data.fps || 24,
      defaultBoardTiming: data.defaultBoardTiming || 2.0
    })
    const boards = Array.isArray(data.boards) ? data.boards : []
    s.boards = boards.map(b => new Board({
      uid: b.uid || uidGen(),
      shot: b.shot || defaultShot(),
      duration: b.duration != null ? b.duration : (data.defaultBoardTiming || 2.0),
      dialogue: b.dialogue || '',
      action: b.action || '',
      notes: b.notes || '',
      newShot: b.newShot || false,
      fps: data.fps || 24
    }))
    if (s.boards.length === 0) s.boards.push(new Board({ duration: s.defaultBoardTiming }))
    return s
  }
}

export function createDefaultScene () {
  const s = new Scene({ name: 'Untitled' })
  s.boards.push(new Board({ duration: 2.0, fps: 24 }))
  s._active = 0
  return s
}
