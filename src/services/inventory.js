import { ref as dbRef, push, update, onValue, query, orderByChild, equalTo, serverTimestamp, increment } from 'firebase/database'
import { db } from '../firebase.js'
import { toArray } from './util.js'
import { applyJobChange } from './jobs.js'

// เครื่องจักรและอุปกรณ์ (/assets), วัสดุอุปกรณ์ (/materials) and their logs. Shapes: DB.md → Assets & inventory.
export const ASSET_STATUSES = ['normal', 'repair', 'written_off', 'expired']
export const ASSET_ACTIONS = ['pm', 'repair', 'change', 'transfer', 'install', 'other']
export const assetStatusColor = { normal: 'is-success', repair: 'is-danger', written_off: 'is-dark', expired: 'is-info' }

/** Live list of the records whose `child` equals `val`, newest `at` first. */
export const listenBy = (path, child, val, cb, err) =>
  onValue(query(dbRef(db, path), orderByChild(child), equalTo(val)),
    (s) => cb(toArray(s.val()).sort((a, b) => (b.at || b.createdAt || 0) - (a.at || a.createdAt || 0))), err || ((e) => console.warn(e)))

/** Create (id = null) or update an asset / material / PM plan; returns its id. Adds a line to its history. */
export async function saveRecord(coll, id, data, actor, note = '') {
  const now = serverTimestamp()
  const rid = id || push(dbRef(db, coll)).key
  const up = {}
  const patch = { ...data, updatedAt: now, updatedBy: actor.name }
  if (!id) Object.assign(patch, { createdAt: now, createdBy: actor.name })
  for (const [k, v] of Object.entries(patch)) up[`${coll}/${rid}/${k}`] = v ?? null
  if (note) up[`${coll}/${rid}/history/${push(dbRef(db, coll)).key}`] = { at: now, byUid: actor.uid, byName: actor.name, note }
  await update(dbRef(db), up)
  return rid
}

/**
 * Add a line to an asset's repair / maintenance log (ซ่อมเครื่องจักร). log = { action, detail, qty, unit, cost, downtime, at, status? }.
 * `status` also changes the asset's status. With `job`, the log is tied to it and the job gets an internal note.
 */
export function addAssetLog(asset, log, actor, job = null, jobNote = '') {
  const id = push(dbRef(db, 'assetLogs')).key
  const { status, ...rest } = log
  const extra = {
    [`assetLogs/${id}`]: { ...rest, assetId: asset.id, jobId: job?.id || null, jobNo: job?.jobNo || null, byUid: actor.uid, byName: actor.name, createdAt: serverTimestamp() }
  }
  if (status && status !== asset.status) Object.assign(extra, { [`assets/${asset.id}/status`]: status, [`assets/${asset.id}/updatedAt`]: serverTimestamp() })
  if (job) return applyJobChange(job, {}, { type: 'comment', note: jobNote, public: false }, actor, extra)
  return update(dbRef(db), extra)
}

/**
 * Stock card line: type "in" (นำเข้าสต็อค) or "out" (ตัดสต็อค). move = { type, qty, price, store, title, detail, at }.
 * `onHand` moves with it in the same write. With `job` (materials used on a job) the job gets an internal note.
 */
export function addStockMove(material, move, actor, job = null, jobNote = '') {
  const id = push(dbRef(db, 'stockMoves')).key
  const qty = Math.abs(Number(move.qty) || 0)
  const delta = move.type === 'in' ? qty : -qty
  const price = Number(move.price ?? material.price) || 0
  const extra = {
    [`stockMoves/${id}`]: {
      materialId: material.id, code: material.code || '', name: material.name || '', type: move.type, qty, delta, unit: material.unit || '',
      price, total: price * qty, store: move.store || material.store || '', title: move.title || '', detail: move.detail || '',
      siteId: job?.siteId || null, buildingId: job?.buildingId || null, areaId: job?.areaId || null,
      jobId: job?.id || null, jobNo: job?.jobNo || null, at: move.at || Date.now(), byUid: actor.uid, byName: actor.name, createdAt: serverTimestamp()
    },
    [`materials/${material.id}/onHand`]: increment(delta),
    [`materials/${material.id}/updatedAt`]: serverTimestamp()
  }
  if (job) return applyJobChange(job, {}, { type: 'comment', note: jobNote, public: false }, actor, extra)
  return update(dbRef(db), extra)
}

/** Suggested order quantity (แนะนำสั่งซื้อ): up to max once on-hand is at or below min. */
export const reorderQty = (m) => (m.max && (m.onHand ?? 0) <= (m.min ?? 0) ? Math.max(0, m.max - (m.onHand ?? 0)) : 0)
/** Red in the list: at or below the minimum (when one is set), or negative */
export const isLow = (m) => (m.onHand ?? 0) < 0 || (!!(m.min || m.max) && (m.onHand ?? 0) <= (m.min ?? 0))
