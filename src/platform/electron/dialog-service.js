'use strict'

// Electron implementation of DialogService.
// Wraps electron.dialog (available via remote in the renderer).

function getDialog () {
  try { return require('electron').dialog } catch (e) {}
  try { return require('@electron/remote').dialog } catch (e) {}
  return null
}

const DialogService = {
  alert (opts) {
    const d = getDialog()
    return d ? d.showMessageBox(opts) : Promise.resolve()
  },
  async confirm (opts) {
    const d = getDialog()
    if (!d) return false
    const { response } = await d.showMessageBox(
      Object.assign({ buttons: ['OK', 'Cancel'] }, opts)
    )
    return response === 0
  },
  open (opts) {
    const d = getDialog()
    return d
      ? d.showOpenDialog(opts)
      : Promise.resolve({ canceled: true, filePaths: [] })
  },
  save (opts) {
    const d = getDialog()
    return d
      ? d.showSaveDialog(opts)
      : Promise.resolve({ canceled: true, filePath: undefined })
  },
  error (title, message) {
    const d = getDialog()
    if (d) d.showErrorBox(title, message)
  },
}

module.exports = DialogService
