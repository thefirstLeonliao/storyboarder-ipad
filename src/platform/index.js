/**
 * Storyboarder Platform Abstraction — unified entry point.
 *
 * RULE (spec §4, §40): UI / React / renderer code MUST only call `Platform.*`.
 * Never `require('electron')`, `@electron/remote`, `fs`, `fs-extra`,
 * `child_process`, `shell`, `dialog`, or read `process.platform` in UI code.
 *
 * Platform is selected at load time:
 *   - Capacitor (iPad)  -> 'ios'      (window.Capacitor present)
 *   - Electron (desktop)-> 'electron'
 *   - Plain web runtime -> 'web'      (npm run web)
 * Override with globalThis.__SB_PLATFORM__ = 'ios' | 'electron' | 'web'.
 */

'use strict'

function detect () {
  try {
    if (typeof window !== 'undefined' && window.Capacitor) return 'ios'
  } catch (e) {}
  try {
    if (typeof process !== 'undefined' && process.versions && process.versions.electron) return 'electron'
  } catch (e) {}
  return 'web'
}

const forced =
  (typeof globalThis !== 'undefined' && globalThis.__SB_PLATFORM__) || null
const name = forced || detect()

let impl
switch (name) {
  case 'electron': impl = require('./electron'); break
  case 'ios':      impl = require('./ios'); break
  default:         impl = require('./web')
}

const Platform = Object.assign({ name }, impl)

if (typeof module !== 'undefined' && module.exports) module.exports = Platform
