// engine.js — Storyboarder Web drawing engine.
// Reuses the original tool/color/size philosophy (shared/reducers/toolbar.js)
// but is implemented fresh on Canvas2D with Pointer Events so it runs in any
// browser (and feeds Apple Pencil / touch later via the same event layer).

export const TOOLS = {
  'light-pencil': { color: '#9a9a9a', opacity: 0.25, size: 4, mode: 'draw' },
  'pencil':       { color: '#1a1a1a', opacity: 1.0,  size: 3, mode: 'draw' },
  'pen':          { color: '#1a1a1a', opacity: 1.0,  size: 2, mode: 'draw' },
  'brush':        { color: '#1a1a1a', opacity: 1.0,  size: 10, mode: 'draw' },
  'eraser':       { color: null,      opacity: 1.0,  size: 22, mode: 'erase' }
}

const UNDO_LIMIT = 15

export class DrawingEngine {
  constructor (canvas, scene, opts = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.scene = scene
    this.onChange = opts.onChange || (() => {})
    this.onActivity = opts.onActivity || (() => {})

    this.tool = 'pencil'
    this.color = '#1a1a1a'
    this.size = 4
    this.onionEnabled = false
    this.referenceEnabled = true

    // per-board undo/redo stacks of cloned canvases
    this.stacks = new Map()

    this.drawing = false
    this.last = null
    this.pointerType = 'mouse'

    this._bind()
    this.resizeToBoard()
  }

  resizeToBoard () {
    this.canvas.width = this.scene.width
    this.canvas.height = this.scene.height
    this.render()
  }

  _stacksFor (uid) {
    if (!this.stacks.has(uid)) this.stacks.set(uid, { undo: [], redo: [] })
    return this.stacks.get(uid)
  }

  setTool (t) { if (TOOLS[t]) this.tool = t }
  setColor (c) { this.color = c }
  setSize (n) { this.size = Math.max(1, Math.min(120, n | 0)) }
  setOnion (v) { this.onionEnabled = v; this.render() }
  setReference (v) { this.referenceEnabled = v; this.render() }

  // ---- rendering: composite onion + reference + active board ----
  render () {
    const b = this.scene.active
    if (!b) return
    const w = this.canvas.width, h = this.canvas.height
    this.ctx.clearRect(0, 0, w, h)
    this.ctx.fillStyle = '#ffffff'
    this.ctx.fillRect(0, 0, w, h)

    // onion skin (previous board ghost)
    if (this.onionEnabled) {
      const idx = this.scene.activeIndex()
      const prev = this.scene.boards[idx - 1]
      if (prev) {
        this.ctx.save()
        this.ctx.globalAlpha = 0.25
        this.ctx.drawImage(prev.canvas, 0, 0, w, h)
        this.ctx.restore()
      }
    }
    // reference overlay
    if (this.referenceEnabled && b.reference) {
      this.ctx.save()
      this.ctx.globalAlpha = 0.5
      this.ctx.drawImage(b.reference, 0, 0, w, h)
      this.ctx.restore()
    }
    // active board drawing
    this.ctx.drawImage(b.canvas, 0, 0, w, h)
  }

  // ---- undo / redo ----
  _snapshot () {
    const b = this.scene.active
    const c = document.createElement('canvas')
    c.width = b.canvas.width; c.height = b.canvas.height
    c.getContext('2d').drawImage(b.canvas, 0, 0)
    const st = this._stacksFor(b.uid)
    st.undo.push(c)
    if (st.undo.length > UNDO_LIMIT) st.undo.shift()
    st.redo.length = 0
  }

  undo () {
    const b = this.scene.active
    const st = this._stacksFor(b.uid)
    if (!st.undo.length) return
    const cur = document.createElement('canvas')
    cur.width = b.canvas.width; cur.height = b.canvas.height
    cur.getContext('2d').drawImage(b.canvas, 0, 0)
    st.redo.push(cur)
    const prev = st.undo.pop()
    b.canvas.getContext('2d').clearRect(0, 0, b.canvas.width, b.canvas.height)
    b.canvas.getContext('2d').drawImage(prev, 0, 0)
    this.render(); this.onChange('undo')
  }

  redo () {
    const b = this.scene.active
    const st = this._stacksFor(b.uid)
    if (!st.redo.length) return
    const cur = document.createElement('canvas')
    cur.width = b.canvas.width; cur.height = b.canvas.height
    cur.getContext('2d').drawImage(b.canvas, 0, 0)
    st.undo.push(cur)
    const next = st.redo.pop()
    b.canvas.getContext('2d').clearRect(0, 0, b.canvas.width, b.canvas.height)
    b.canvas.getContext('2d').drawImage(next, 0, 0)
    this.render(); this.onChange('redo')
  }

  clear () {
    const b = this.scene.active
    this._snapshot()
    b.canvas.getContext('2d').clearRect(0, 0, b.canvas.width, b.canvas.height)
    this.render(); this.onChange('clear')
  }

  // ---- pointer input ----
  _bind () {
    const c = this.canvas
    c.addEventListener('pointerdown', e => this._down(e))
    c.addEventListener('pointermove', e => this._move(e))
    window.addEventListener('pointerup', e => this._up(e))
    c.addEventListener('pointercancel', e => this._up(e))
    // prevent context menu / scroll on the canvas
    c.addEventListener('contextmenu', e => e.preventDefault())
  }

  _pos (e) {
    const r = this.canvas.getBoundingClientRect()
    const sx = this.canvas.width / r.width
    const sy = this.canvas.height / r.height
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy }
  }

  _down (e) {
    e.preventDefault()
    try { this.canvas.setPointerCapture && this.canvas.setPointerCapture(e.pointerId) } catch {}
    this.pointerType = e.pointerType || 'mouse'
    const b = this.scene.active
    if (!b) return
    this._snapshot()
    this.drawing = true
    const p = this._pos(e)
    this.last = p
    // dot for a single tap
    this._stroke(p, p, e)
  }

  _move (e) {
    if (!this.drawing) return
    e.preventDefault()
    const p = this._pos(e)
    this._stroke(this.last, p, e)
    this.last = p
  }

  _up (e) {
    if (!this.drawing) return
    this.drawing = false
    this.render()
    this.onChange('draw')
    this.onActivity()
  }

  _stroke (from, to, e) {
    const b = this.scene.active
    const ctx = b.canvas.getContext('2d')
    const t = TOOLS[this.tool] || TOOLS.pencil
    const pressure = (e && e.pressure && e.pressure > 0) ? e.pressure : 0.5
    const base = (this.size || t.size)
    const width = Math.max(0.5, base * (0.35 + 0.65 * pressure))

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (t.mode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = (this.tool === 'pencil' || this.tool === 'light-pencil') ? t.opacity : 1
      ctx.strokeStyle = this.color || t.color || '#1a1a1a'
    }
    ctx.lineWidth = width
    ctx.beginPath()
    const mx = (from.x + to.x) / 2
    const my = (from.y + to.y) / 2
    ctx.moveTo(from.x, from.y)
    ctx.quadraticCurveTo(from.x, from.y, mx, my)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    ctx.restore()

    // live composite
    this.render()
  }

  loadBoard () {
    // called when active board changes
    this.render()
  }
}
