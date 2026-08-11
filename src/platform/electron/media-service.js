'use strict'

// Electron implementation of MediaService.
//
// PHASE 0 SCAFFOLD: the existing export pipeline
// (src/js/window/exporter.js + src/js/exporters/*) is intentionally UNCHANGED
// so the desktop build keeps working. Full wiring into MediaService happens in
// Phase 6 (Export, spec §35). The iPad build implements the same interface with
// AVFoundation behind StoryboarderNativePlugin (spec §21/§22).

const MediaService = {
  exportAnimatic () {
    return Promise.reject(
      new Error('MediaService.exportAnimatic: wire in Phase 6 (Electron: ffmpeg | iPad: AVFoundation)')
    )
  },
  exportPDF () {
    return Promise.reject(
      new Error('MediaService.exportPDF: wire in Phase 6 (Electron: pdfkit | iPad: PDFKit)')
    )
  },
  exportImages () {
    return Promise.reject(new Error('MediaService.exportImages: wire in Phase 6'))
  },
  exportGIF () {
    return Promise.reject(new Error('MediaService.exportGIF: P2 — deferred (spec §23)'))
  },
}

module.exports = MediaService
