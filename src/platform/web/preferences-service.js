'use strict'

// Plain web runtime PreferencesService. In-memory store for Phase 1.

const store = {}

const WebPreferencesService = {
  init: () => {},
  get: (k) => store[k],
  getAll: () => store,
  set: (k, v) => { store[k] = v },
}

module.exports = WebPreferencesService
