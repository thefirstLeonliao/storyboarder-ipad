'use strict'

// Electron implementation of ShareService.
// "Edit Externally" (spec §26): open board image in Photoshop / Procreate / etc.

const ShareService = {
  openInApp: (filePath, appPath) => {
    try {
      const shell = require('electron').shell
      if (appPath) shell.openItem(appPath)
      else if (filePath) shell.openPath(filePath)
    } catch (e) {}
  },
  // iPad: UIActivityViewController via StoryboarderNativePlugin
  shareSheet: (/* items */) => {},
}

module.exports = ShareService
