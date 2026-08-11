/**
 * Storyboarder Web Runtime - zero-dependency static dev server.
 *
 * Intentionally has no npm dependencies so `npm run web` works immediately,
 * with no install step and no bundler. The app is authored as native ES
 * modules, so the browser loads `public/js/main.js` directly.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ROOT = process.env.SB_SERVE_ROOT
  ? path.resolve(process.env.SB_SERVE_ROOT)
  : path.join(__dirname, 'public')

const PORT = Number(process.env.PORT || 8088)
const HOST = process.env.HOST || '127.0.0.1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.storyboarder': 'application/json; charset=utf-8',
  '.zip': 'application/zip'
}

const server = http.createServer((req, res) => {
  let urlPath
  try {
    urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname)
  } catch {
    res.writeHead(400).end('Bad Request')
    return
  }

  if (urlPath === '/') urlPath = '/index.html'

  // Resolve and confine to ROOT (prevent path traversal)
  const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^([/\\])+/, ''))
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden')
    return
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(`404 Not Found: ${urlPath}`)
      return
    }

    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      // Always revalidate during development so edits show up on reload.
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    })
    fs.createReadStream(filePath).pipe(res)
  })
})

server.listen(PORT, HOST, () => {
  console.log('')
  console.log('  Storyboarder — Web Runtime')
  console.log('  ──────────────────────────────────────────────')
  console.log(`  serving : ${ROOT}`)
  console.log(`  desktop : http://${HOST}:${PORT}/`)
  console.log(`  iPad     : http://${HOST}:${PORT}/?ipad=1`)
  console.log('')
})
