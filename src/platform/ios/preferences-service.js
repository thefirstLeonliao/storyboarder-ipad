'use strict'

// iPad implementation of PreferencesService.
// Persist to UserDefaults (or a JSON sidecar inside the project bundle).
// Phase 1 stub keeps an in-memory store so the UI renders without crashing.

const store = {}

const IOSPreferencesService = {
  init: () => {},
  get: (k) => store[k],
  getAll: () => store,
  set: (k, v) => { store[k] = v },
}

module.exports = IOSPreferencesService
