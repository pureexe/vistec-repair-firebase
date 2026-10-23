import { ref as sRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { ref as dbRef, push, set, remove, get } from 'firebase/database'
import { storage, db, IMAGE_STORE } from '../firebase.js'

const MAX_W = 1280
const MAX_H = 720 // "less than 720p"
const QUALITY = 0.72

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
    img.src = url
  })
}

/**
 * Resize to fit within 1280×720 (landscape) / 720×1280 (portrait) and encode WebP.
 * Uses canvas WebP encoding when the browser supports it, otherwise falls back to a WASM encoder
 * (Safari cannot encode WebP from canvas).
 */
export async function compressImage(file) {
  let source
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    source = await loadImage(file)
  }
  const sw = source.width, sh = source.height
  const landscape = sw >= sh
  const boxW = landscape ? MAX_W : MAX_H
  const boxH = landscape ? MAX_H : MAX_W
  const scale = Math.min(1, boxW / sw, boxH / sh)
  const w = Math.max(1, Math.round(sw * scale))
  const h = Math.max(1, Math.round(sh * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(source, 0, 0, w, h)
  if (source.close) source.close()

  let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', QUALITY))
  if (!blob || blob.type !== 'image/webp') {
    const { encode } = await import('@jsquash/webp')
    const data = ctx.getImageData(0, 0, w, h)
    const buf = await encode(data, { quality: Math.round(QUALITY * 100) })
    blob = new Blob([buf], { type: 'image/webp' })
  }
  return { blob, w, h, bytes: blob.size }
}

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob)
})

/** Upload a compressed photo; returns the metadata to store in jobs/{id}/photos/{pid}. */
export async function uploadJobPhoto(jobId, img, uid) {
  const pid = push(dbRef(db, `jobs/${jobId}/photos`)).key
  const meta = { w: img.w, h: img.h, bytes: img.bytes, by: uid || null, at: Date.now() }
  if (IMAGE_STORE === 'rtdb') {
    await set(dbRef(db, `jobPhotos/${jobId}/${pid}`), await blobToDataUrl(img.blob))
    return { pid, meta: { ...meta, store: 'rtdb' } }
  }
  const path = `jobs/${jobId}/${pid}.webp`
  const r = sRef(storage, path)
  await uploadBytes(r, img.blob, { contentType: 'image/webp', cacheControl: 'public,max-age=31536000', customMetadata: { uid: uid || '' } })
  const url = await getDownloadURL(r)
  return { pid, meta: { ...meta, store: 'storage', path, url } }
}

export async function photoSrc(jobId, pid, p) {
  if (p?.url) return p.url
  if (p?.store === 'rtdb') return (await get(dbRef(db, `jobPhotos/${jobId}/${pid}`))).val()
  return null
}

export async function deleteJobPhotoBlob(jobId, pid, p) {
  try {
    if (p?.store === 'rtdb') await remove(dbRef(db, `jobPhotos/${jobId}/${pid}`))
    else if (p?.path) await deleteObject(sRef(storage, p.path))
  } catch (e) { console.warn(e) }
}
