// zip.js — minimal STORE/DEFLATE zip reader+writer, zero dependencies.
// Used to import/export real .storyboarder packages (Project.storyboarder JSON
// + boards/<uid>/images/*.png) compatible with the desktop app.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()

export function crc32 (bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function enc (str) { return new TextEncoder().encode(str) }

function concat (chunks) {
  let len = 0
  for (const c of chunks) len += c.length
  const out = new Uint8Array(len)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out
}

// entries: [{ name: string, data: Uint8Array }]
export function createZip (entries) {
  const locals = []
  const centrals = []
  let offset = 0
  const textEncoder = new TextEncoder()

  for (const e of entries) {
    const nameBytes = textEncoder.encode(e.name)
    const data = e.data
    const crc = crc32(data)

    const local = concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), nameBytes, data
    ])
    locals.push(local)

    const central = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset),
      nameBytes
    ])
    centrals.push(central)

    offset += local.length
  }

  const cd = concat(centrals)
  const end = concat([
    u32(0x06054b50), u16(0), u16(0),
    u16(entries.length), u16(entries.length),
    u32(cd.length), u32(offset), u16(0)
  ])

  return new Blob([concat([...locals, cd, end])], { type: 'application/zip' })
}

function u16 (n) { const a = new Uint8Array(2); new DataView(a.buffer).setUint16(0, n, true); return a }
function u32 (n) { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, n, true); return a }

// Parse a zip Blob -> Promise<[{ name, data: Uint8Array }]>
export async function parseZip (blob) {
  const buf = new Uint8Array(await blob.arrayBuffer())
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)

  // find End Of Central Directory
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Not a zip file')
  const cdOffset = dv.getUint32(eocd + 16, true)
  const cdCount = dv.getUint16(eocd + 10, true)

  const out = []
  let p = cdOffset
  for (let i = 0; i < cdCount; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break
    const method = dv.getUint16(p + 10, true)
    const crc = dv.getUint32(p + 16, true)
    const compSize = dv.getUint32(p + 20, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    const localOffset = dv.getUint32(p + 42, true)
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen

    // local header
    const lh = localOffset
    const lNameLen = dv.getUint16(lh + 26, true)
    const lExtraLen = dv.getUint16(lh + 28, true)
    const dataStart = lh + 30 + lNameLen + lExtraLen
    let data = buf.subarray(dataStart, dataStart + compSize)

    if (method === 8) {
      data = new Uint8Array(await new Response(
        new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      ).arrayBuffer())
    }
    out.push({ name, data })
  }
  return out
}

// Bundle scene JSON + board PNGs into a downloadable .storyboarder Blob.
export async function buildStoryboarderBlob (scene, renderBoardPNG) {
  const sceneJSON = JSON.stringify(scene.toJSON(), null, 2)
  const entries = [{ name: 'Project.storyboarder', data: enc(sceneJSON) }]
  for (const b of scene.boards) {
    const png = await renderBoardPNG(b)
    if (png) entries.push({ name: `boards/${b.uid}/images/ink.png`, data: new Uint8Array(png) })
  }
  return createZip(entries)
}
