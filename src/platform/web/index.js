'use strict'

module.exports = {
  file: require('./file-service'),
  dialog: require('./dialog-service'),
  media: require('./media-service'),
  preferences: require('./preferences-service'),

  // Phase 1 web stubs
  system: {
    platform: () => 'web',
    locale: () => (typeof navigator !== 'undefined' && navigator.language) || 'en-US',
    clipboard: {
      writeText: (t) => { if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(t) },
      readText: () => (typeof navigator !== 'undefined' && navigator.clipboard) ? navigator.clipboard.readText() : Promise.resolve(''),
    },
    openExternal: (url) => { if (typeof window !== 'undefined') window.open(url, '_blank') },
    setIdleDisabled: () => {},
  },
  share: {
    openInApp: () => {},
    shareSheet: () => {},
  },
  window: {
    setMenu: () => {},
    registerShortcuts: () => {},
    openPopover: () => {},
  },
}
