'use strict'

// iPad implementation of FileService — backed by StoryboarderNativePlugin (spec §6, §15).
//
// Replaces fs-extra with:
//   - UIDocumentPickerViewController  -> open / save
//   - FileManager.default             -> read / write / mkdir / stat / copy / unlink
//   - Security-scoped bookmarks        -> persistent access to user-chosen dirs
//   - UniformTypeIdentifiers           -> register the .storyboarder type (Info.plist)
//
// This module is only loaded when Platform.name === 'ios' (i.e. inside the
// Capacitor WKWebView shell), so window.Capacitor is guaranteed present.
//
// NOTE: the web runtime persists boards/metadata in IndexedDB, not the filesystem,
// so the directory-walking helpers (readdir/stat/copy/...) are intentionally thin —
// project packages are exchanged with the native side as whole blobs.

const Native = require('./capacitor-bridge')

function reject (what) {
  return () => Promise.reject(
    new Error(`IOSFileService.${what}: not supported via this bridge on iPad (use project blob / IndexedDB)`)
  )
}

const IOSFileService = {
  join: (...a) => a.join('/'),
  basename: (p, e) => {
    const b = p.split('/').pop()
    return e && b.endsWith(e) ? b.slice(0, -e.length) : b
  },
  dirname: (p) => p.split('/').slice(0, -1).join('/'),
  extname: (p) => {
    const b = p.split('/').pop()
    const i = b.lastIndexOf('.')
    return i >= 0 ? b.slice(i) : ''
  },
  sep: '/',

  documentsDirectory: () => Native.getDocumentsDir().then(r => r.path),
  userDataDirectory: () => Native.getLibraryDir().then(r => r.path),

  async read (path) {
    const { dataBase64 } = await Native.readFile(path)
    return Native.base64ToBlob(dataBase64)
  },
  async readText (path) {
    const { dataBase64 } = await Native.readFile(path)
    return atob(dataBase64)
  },
  async readJSON (path) {
    return JSON.parse(await this.readText(path))
  },
  async write (path, blob) {
    const b64 = await Native.blobToBase64(blob)
    const r = await Native.writeFile(path, b64)
    return r.path
  },
  async writeText (path, text) {
    const r = await Native.writeFile(path, btoa(unescape(encodeURIComponent(text))))
    return r.path
  },
  async writeJSON (path, obj) {
    return this.writeText(path, JSON.stringify(obj, null, 2))
  },
  async exists (path) {
    try { await Native.readFile(path); return true } catch { return false }
  },
  // writeFile already creates intermediate directories on the native side.
  mkdirp: () => Promise.resolve(true),

  readdir: reject('readdir'),
  stat: reject('stat'),
  unlink: reject('unlink'),
  copy: reject('copy'),
  rename: reject('rename'),
  trash: reject('trash'),
}

module.exports = IOSFileService
