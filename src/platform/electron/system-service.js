'use strict'

// Electron implementation of SystemService.

function getApp () {
  try { return require('electron').remote.app } catch (e) {}
  try { return require('@electron/remote').app } catch (e) {}
  return null
}

const SystemService = {
  platform: () => (typeof process !== 'undefined' && process.platform) || 'web',
  locale: () => {
    const a = getApp()
    return a ? a.getLocale() : 'en-US'
  },
  clipboard: {
    writeText: (t) => {
      try { require('electron').clipboard.writeText(t) }
      catch (e) { if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(t) }
    },
    readText: () => {
      try { return require('electron').clipboard.readText() } catch (e) { return '' }
    },
  },
  openExternal: (url) => {
    try { require('electron').shell.openExternal(url) } catch (e) {}
  },
  // desktop equivalent is powerSaveBlocker; iPad uses UIApplication.idleTimerDisabled
  setIdleDisabled: () => {},
}

module.exports = SystemService
