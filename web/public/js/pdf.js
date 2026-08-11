// pdf.js — minimal zero-dependency PDF writer (JPEG images + text).
// Each page = one board image (DCTDecode/JPEG) sized to fit, with its
// metadata rendered as text below — matching Storyboarder's PDF spirit.
// No npm dependencies; returns a Blob the browser can download.

function enc (s) { return new TextEncoder().encode(s) }
function pdfEscape (s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

// pages: [{ jpeg: Uint8Array, w: int, h: int, lines: string[] }]
// Each `lines` is an array of text strings drawn bottom-up under the image.
export function buildPdf (pages) {
  const chunks = []
  let len = 0
  const write = c => { chunks.push(c); len += c.length }
  const wstr = s => write(enc(s))

  // header (with a binary comment so parsers treat it as binary-safe)
  wstr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')

  const offsets = [] // offsets[n] = byte offset of object n (1-based)
  const startObj = n => { offsets[n] = len; wstr(`${n} 0 obj\n`) }
  const endObj = () => wstr('endobj\n')

  // 1: Catalog
  const catalogNum = 1
  startObj(catalogNum)
  wstr('<< /Type /Catalog /Pages 2 0 R >>')
  endObj()

  // Font (Helvetica)
  const fontNum = 3
  startObj(fontNum)
  wstr('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  endObj()

  const pageNums = []
  const contentNums = []
  const imgNums = []

  const PAGE_W = 595.28 // A4
  const PAGE_H = 841.89
  const MARGIN = 36
  const textGap = 16

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]
    // image object
    const imgNum = 4 + i * 3
    startObj(imgNum)
    wstr(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\n`)
    wstr('stream\n')
    write(p.jpeg)
    wstr('\nendstream')
    endObj()

    // content stream: place image fit-to-width, then text lines below
    const availW = PAGE_W - MARGIN * 2
    const scale = Math.min(1, availW / p.w)
    const drawW = p.w * scale
    const drawH = p.h * scale
    const imgX = (PAGE_W - drawW) / 2
    const imgY = PAGE_H - MARGIN - drawH

    let content = 'q\n'
    content += `${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${imgX.toFixed(2)} ${imgY.toFixed(2)} cm\n`
    content += '/Im0 Do\nQ\n'
    // text
    let ty = imgY - textGap
    const lineH = 14
    for (const line of (p.lines || [])) {
      content += `BT /F1 10 Tf 1 0 0 1 ${MARGIN.toFixed(2)} ${ty.toFixed(2)} Tm (${pdfEscape(line)}) Tj ET\n`
      ty -= lineH
    }

    const contentNum = imgNum + 1
    startObj(contentNum)
    wstr(`<< /Length ${enc(content).length} >>\nstream\n${content}\nendstream`)
    endObj()

    const pageNum = imgNum + 2
    startObj(pageNum)
    wstr(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)}] ` +
      `/Resources << /XObject << /Im0 ${imgNum} 0 R >> /Font << /F1 ${fontNum} 0 R >> >> ` +
      `/Contents ${contentNum} 0 R >>`)
    endObj()

    pageNums.push(pageNum)
    contentNums.push(contentNum)
    imgNums.push(imgNum)
  }

  // 2: Pages (must be object 2)
  startObj(2)
  wstr(`<< /Type /Pages /Kids [${pageNums.map(n => `${n} 0 R`).join(' ')}] /Count ${pageNums.length} >>`)
  endObj()

  // xref
  const xrefOffset = len
  wstr('xref\n')
  wstr(`0 ${offsets.length + 1}\n`)
  wstr('0000000000 65535 f \n')
  for (let n = 1; n <= offsets.length; n++) {
    const off = offsets[n] != null ? offsets[n] : 0
    wstr(String(off).padStart(10, '0') + ' 00000 n \n')
  }
  wstr('trailer\n')
  wstr(`<< /Size ${offsets.length + 1} /Root ${catalogNum} 0 R >>\n`)
  wstr('startxref\n')
  wstr(`${xrefOffset}\n`)
  wstr('%%EOF')

  // assemble
  let total = 0
  for (const c of chunks) total += c.length
  const out = new Uint8Array(total)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return new Blob([out], { type: 'application/pdf' })
}
