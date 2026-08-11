// storage.js — browser-persistent project storage (IndexedDB).
// Autosave keeps the whole scene + every board's drawing so a page refresh
// restores exactly what the user had. No Electron / Node required.

import { Scene } from './scene.js'

const DB_NAME = 'storyboarder-web'
const STORE = 'projects'
const KEY = 'current'

function openDB () {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx (db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE)
}

function canvasToBlob (canvas) {
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'))
}

export async function saveScene (scene) {
  const db = await openDB()
  const boards = []
  for (const b of scene.boards) {
    const blob = await canvasToBlob(b.canvas)
    boards.push({ uid: b.uid, blob })
  }
  const record = {
    name: scene.name,
    savedAt: Date.now(),
    sceneJSON: scene.toJSON(),
    boards
  }
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').put(record, KEY)
    req.onsuccess = () => resolve(record.savedAt)
    req.onerror = () => reject(req.error)
  })
}

export async function hasSavedProject () {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').get(KEY)
    req.onsuccess = () => resolve(!!req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function loadScene () {
  const db = await openDB()
  const record = await new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').get(KEY)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  if (!record) return null

  const scene = Scene.fromJSON(record.sceneJSON)
  await Promise.all(scene.boards.map(async b => {
    const saved = record.boards.find(x => x.uid === b.uid)
    if (!saved || !saved.blob) return
    const url = URL.createObjectURL(saved.blob)
    await new Promise(res => {
      const img = new Image()
      img.onload = () => { b.canvas.getContext('2d').drawImage(img, 0, 0, b.canvas.width, b.canvas.height); URL.revokeObjectURL(url); res() }
      img.onerror = () => { URL.revokeObjectURL(url); res() }
      img.src = url
    })
  }))
  return scene
}
