'use strict'

/**
 * capacitor-bridge.js — the single JS↔Swift glue for the iPad native shell.
 *
 * Used by src/platform/ios/*-service.js when the web runtime runs inside the
 * Capacitor WKWebView (Platform.name === 'ios'). Every method talks to
 * window.Capacitor.Plugins.StoryboarderNativePlugin, which is StoryboarderNativePlugin.swift.
 *
 * Design (spec §4, §40): the renderer/web code never imports Capacitor directly.
 * It goes through Platform.* → ios/*-service.js → this bridge → native.
 */

function plugin () {
  const C = (typeof window !== 'undefined' && window.Capacitor) ? window.Capacitor : null
  if (!C || !C.Plugins || !C.Plugins.StoryboarderNativePlugin) return null
  return C.Plugins.StoryboarderNativePlugin
}

function ensure () {
  const p = plugin()
  if (!p) throw new Error('StoryboarderNativePlugin unavailable (not in Capacitor shell)')
  return p
}

function blobToBase64 (blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onerror = () => reject(fr.error)
    fr.onload = () => {
      const bin = fr.result.split(',')[1] || ''
      resolve(bin)
    }
    fr.readAsDataURL(blob)
  })
}

function base64ToBlob (b64, type) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: type || 'application/octet-stream' })
}

const Native = {
  available: () => !!plugin(),

  // ---- low-level passthroughs ----
  getDocumentsDir: () => ensure().getDocumentsDir(),
  getLibraryDir: () => ensure().getLibraryDir(),
  pickDocument: (types) => ensure().pickDocument({ types }),
  readFile: (path) => ensure().readFile({ path }),
  writeFile: (path, dataBase64) => ensure().writeFile({ path, dataBase64 }),
  saveToFiles: (dataBase64, fileName) => ensure().saveToFiles({ dataBase64, fileName }),
  shareSheet: (items) => ensure().shareSheet({ items }),
  exportPDF: (pages) => ensure().exportPDF({ pages }),
  exportAnimatic: (opts) => ensure().exportAnimatic(opts),
  alert: (title, message) => ensure().alert({ title, message }),
  confirm: (title, message) => ensure().confirm({ title, message }),

  // ---- high-level helpers ----

  /** Pick a .storyboarder / JSON project and return { name, dataBase64 }. */
  async importProjectFile () {
    const { filePaths } = await this.pickDocument(['com.wonderunit.storyboarder', 'public.item'])
    if (!filePaths || !filePaths.length) return null
    const path = filePaths[0]
    const { dataBase64, path: realPath } = await this.readFile(path)
    const name = (realPath || path).split('/').pop()
    return { name, dataBase64 }
  },

  /**
   * Save a Blob (project package / PDF / PNG) to the app's Documents dir and
   * present the iOS Share Sheet so the user can push it to Files / AirDrop / etc.
   * Returns the on-device path.
   */
  async exportBlob (blob, fileName) {
    const dataBase64 = await blobToBase64(blob)
    const { path: docs } = await this.getDocumentsDir()
    const target = docs + '/' + fileName
    await this.writeFile(target, dataBase64)
    await this.shareSheet([target])
    return target
  },

  /** Build a native PDF from JPEG frames + metadata lines, then share it. */
  async exportPdfFromPages (pages, fileName) {
    const { path } = await this.exportPDF(pages)
    await this.shareSheet([path])
    return path
  },

  /** Encode JPEG frames to an .mp4/.mov animatic and share it. */
  async exportAnimaticFromFrames (frames, fps, width, height, format) {
    const { path } = await this.exportAnimatic({ frames, fps, width, height, format })
    await this.shareSheet([path])
    return path
  },

  // ---- converters (exposed for the service layer) ----
  blobToBase64,
  base64ToBlob,
}

module.exports = Native
