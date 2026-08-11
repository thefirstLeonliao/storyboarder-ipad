'use strict'

// iPad implementation of DialogService — backed by StoryboarderNativePlugin (spec §6).
// alert/confirm -> UIAlertController; open/save -> UIDocumentPickerViewController.

const Native = require('./capacitor-bridge')

const IOSDialogService = {
  alert: (message, title = 'Storyboarder') => Native.alert(title, message),
  confirm: async (message, title = 'Storyboarder') => {
    const r = await Native.confirm(title, message)
    return !!r.confirmed
  },
  error: (message, title = 'Error') => Native.alert(title, message),
  /** Open a document; returns the picked path or null. */
  async open (types = ['com.wonderunit.storyboarder', 'public.item']) {
    const r = await Native.pickDocument(types)
    return r.filePaths && r.filePaths[0] ? r.filePaths[0] : null
  },
  /** Save a blob to Files; returns the staged path. */
  async save (blob, fileName) {
    return Native.exportBlob(blob, fileName)
  },
}

module.exports = IOSDialogService
