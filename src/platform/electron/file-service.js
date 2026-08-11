'use strict'

// Electron implementation of FileService.
// Wraps the SAME fs-extra behavior the desktop app already uses, so the
// desktop build keeps working unchanged (spec §40 Rule 2). UI code migrates
// from direct `fs`/`fs-extra` calls to `Platform.file.*` over time.

const fs = require('fs-extra')
const path = require('path')

function getApp () {
  try { return require('electron').remote.app } catch (e) {}
  try { return require('@electron/remote').app } catch (e) {}
  return null
}

const FileService = {
  // ---- path helpers (pure, platform-agnostic) ----
  join: (...a) => path.join(...a),
  basename: (p, e) => path.basename(p, e),
  dirname: (p) => path.dirname(p),
  extname: (p) => path.extname(p),
  sep: path.sep,

  // ---- directories ----
  documentsDirectory () {
    const app = getApp()
    return app ? app.getPath('documents') : path.join(process.cwd(), 'Documents')
  },
  userDataDirectory () {
    const app = getApp()
    return app ? app.getPath('userData') : path.join(process.cwd(), 'userData')
  },

  // ---- async I/O (promise-based) ----
  read: (p) => fs.readFile(p),
  readText: (p) => fs.readFile(p, 'utf-8'),
  readJSON: async (p) => JSON.parse(await fs.readFile(p, 'utf-8')),
  write: (p, data) => fs.writeFile(p, data),
  writeText: (p, t) => fs.writeFile(p, t, 'utf-8'),
  writeJSON: (p, o) => fs.writeFile(p, JSON.stringify(o, null, 2)),
  exists: (p) => fs.pathExists(p),
  mkdirp: (p) => fs.ensureDir(p),
  readdir: (p) => fs.readdir(p),
  stat: (p) => fs.stat(p),
  unlink: (p) => fs.unlink(p),
  copy: (s, d) => fs.copy(s, d),
  rename: (s, d) => fs.move(s, d, { overwrite: true }),
  trash: (p) => {
    try { return require('trash')(p) } catch (e) { return fs.remove(p) }
  },
}

module.exports = FileService
