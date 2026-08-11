'use strict'

// Electron implementation of WindowService.
// Window/menu/shortcut management. On desktop this will delegate to the native
// menu (src/js/main/menu.js) via IPC in Phase 2; on iPad, windows become
// views/popovers and shortcuts map to ShortcutService (spec §19).

const WindowService = {
  setMenu: () => { /* delegate to main/menu.js in Phase 2 */ },
  registerShortcuts: () => { /* ShortcutService wired in Phase 1 (spec §19) */ },
  openPopover: () => { /* iPad: drawer/popover (spec §12) */ },
}

module.exports = WindowService
