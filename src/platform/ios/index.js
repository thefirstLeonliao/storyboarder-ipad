'use strict'

const Native = require('./capacitor-bridge')

module.exports = {
  file: require('./file-service'),
  dialog: require('./dialog-service'),
  media: require('./media-service'),
  preferences: require('./preferences-service'),

  // Native-backed services (spec §26, §31/§32).
  system: {
    platform: () => 'ios',
    locale: () => (typeof navigator !== 'undefined' && navigator.language) || 'en-US',
    clipboard: {
      writeText: (t) => { if (navigator.clipboard) return navigator.clipboard.writeText(t); return Promise.resolve() },
      readText: () => (navigator.clipboard ? navigator.clipboard.readText() : Promise.resolve('')),
    },
    openExternal: (url) => { if (typeof window !== 'undefined') window.open(url, '_blank') },
    setIdleDisabled: () => {},
  },
  share: {
    openInApp: (items) => Native.shareSheet(Array.isArray(items) ? items : [items]),
    shareSheet: (items) => Native.shareSheet(Array.isArray(items) ? items : [items]),
  },
  window: {
    setMenu: () => {},
    registerShortcuts: () => {},
    openPopover: () => {},
  },
}
