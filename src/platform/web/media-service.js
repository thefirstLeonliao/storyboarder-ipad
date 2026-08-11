'use strict'

// Plain web runtime MediaService (spec §30). Disabled in Phase 1.
// Phase 6 may reuse the browser PDF pipeline where possible (spec §22).

const WebMediaService = {
  exportAnimatic: () => Promise.reject(new Error('WebMediaService.exportAnimatic: unavailable in web runtime (Phase 1)')),
  exportPDF: () => Promise.reject(new Error('WebMediaService.exportPDF: unavailable in web runtime (Phase 1)')),
  exportImages: () => Promise.reject(new Error('WebMediaService.exportImages: unavailable in web runtime (Phase 1)')),
  exportGIF: () => Promise.reject(new Error('WebMediaService.exportGIF: P2 deferred')),
}

module.exports = WebMediaService
