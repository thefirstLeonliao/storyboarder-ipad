'use strict'

// iPad implementation of MediaService — backed by StoryboarderNativePlugin (spec §21, §22).
//   exportAnimatic -> AVFoundation (AVAssetWriter, H.264/HEVC MP4/MOV)
//   exportPDF      -> UIGraphicsPDFRenderer (native PDF assembly)
// Implemented in StoryboarderNativePlugin.swift; this module is the JS glue.

const Native = require('./capacitor-bridge')

const IOSMediaService = {
  /**
   * @param frames  Array of JPEG Blob/ArrayBuffer (one per board, in order)
   * @param fps     frames per second
   * @param width   frame width in px
   * @param height  frame height in px
   * @param format  'mp4' | 'mov'
   */
  async exportAnimatic (frames, fps, width, height, format = 'mp4') {
    const b64 = []
    for (const f of frames) {
      const blob = f instanceof Blob ? f : new Blob([f], { type: 'image/jpeg' })
      b64.push(await Native.blobToBase64(blob))
    }
    return Native.exportAnimaticFromFrames(b64, fps, width, height, format)
  },

  /**
   * @param pages  Array<{ jpeg: Blob|ArrayBuffer, lines: string[] }>
   * Builds a native A4 PDF and presents the Share Sheet.
   */
  async exportPDF (pages) {
    const nativePages = []
    for (const p of pages) {
      const blob = p.jpeg instanceof Blob ? p.jpeg : new Blob([p.jpeg], { type: 'image/jpeg' })
      nativePages.push({ jpegBase64: await Native.blobToBase64(blob), lines: p.lines || [] })
    }
    return Native.exportPdfFromPages(nativePages, 'storyboarder.pdf')
  },

  /** Export a single board image (PNG) via the native Share Sheet. */
  async exportImages (blobs, fileName = 'board.png') {
    const blob = blobs instanceof Blob ? blobs : new Blob([blobs], { type: 'image/png' })
    return Native.exportBlob(blob, fileName)
  },

  exportGIF: () => Promise.reject(new Error('IOSMediaService.exportGIF: P2 deferred (spec §23)')),
}

module.exports = IOSMediaService
