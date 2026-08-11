'use strict'

// Electron implementation of PreferencesService.
// Delegates to the existing src/js/prefs.js (fs-extra backed).

let prefs = null
function getPrefs () {
  if (!prefs) prefs = require('../../js/prefs')
  return prefs
}

const PreferencesService = {
  init: (p) => getPrefs().init(p),
  get: (k) => getPrefs().getPrefs(k),
  getAll: () => getPrefs().getPrefs(),
  set: (k, v) => getPrefs().set(k, v),
}

module.exports = PreferencesService
