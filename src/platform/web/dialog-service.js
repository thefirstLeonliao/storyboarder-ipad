'use strict'

// Plain web runtime DialogService (spec §30).
// alert/confirm use the browser; open/save are disabled until a backend exists.

const WebDialogService = {
  alert: (opts) => {
    if (typeof window !== 'undefined') window.alert((opts && opts.message) || '')
    return Promise.resolve()
  },
  confirm: (opts) => {
    if (typeof window !== 'undefined') {
      return Promise.resolve(window.confirm((opts && opts.message) || ''))
    }
    return Promise.resolve(false)
  },
  open: () => Promise.reject(new Error('WebDialogService.open: unavailable in web runtime (Phase 1, spec §30)')),
  save: () => Promise.reject(new Error('WebDialogService.save: unavailable in web runtime (Phase 1, spec §30)')),
  error: (title, message) => {
    if (typeof window !== 'undefined') window.alert(`${title}: ${message}`)
  },
}

module.exports = WebDialogService
