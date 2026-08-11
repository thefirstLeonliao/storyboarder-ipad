'use strict'

// Plain web runtime (npm run web, spec §30).
// Per §30, Open / Save / Export are UNAVAILABLE in Phase 1, but the
// UI / Canvas / Timeline MUST render. Methods reject with clear errors so any
// missing wiring is obvious rather than failing silently.

function disabled (what) {
  return () => Promise.reject(
    new Error(`WebFileService.${what}: unavailable in web runtime (Phase 1, spec §30). Use the Electron or iPad build.`)
  )
}

const WebFileService = {
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

  documentsDirectory: () => Promise.reject(new Error('WebFileService.documentsDirectory: unavailable in web runtime')),
  userDataDirectory: () => Promise.reject(new Error('WebFileService.userDataDirectory: unavailable in web runtime')),

  read: disabled('read'),
  readText: disabled('readText'),
  readJSON: disabled('readJSON'),
  write: disabled('write'),
  writeText: disabled('writeText'),
  writeJSON: disabled('writeJSON'),
  exists: disabled('exists'),
  mkdirp: disabled('mkdirp'),
  readdir: disabled('readdir'),
  stat: disabled('stat'),
  unlink: disabled('unlink'),
  copy: disabled('copy'),
  rename: disabled('rename'),
  trash: disabled('trash'),
}

module.exports = WebFileService
