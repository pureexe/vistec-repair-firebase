import {
  ref as dbRef, push, update, runTransaction, onValue, query, orderByChild, equalTo, limitToLast, serverTimestamp, get
} from 'firebase/database'
import { db } from '../firebase.js'
import { randomCode, toArray } from './util.js'
import { uploadJobPhoto } from './images.js'

// Fields of a job that are mirrored to the public /tracking/{code} node (no personal data!)
const PUBLIC_FIELDS = ['status', 'jobTypeId', 'buildingId', 'areaId', 'expectedDate', 'expectedNote', 'hold', 'updatedAt']

async function nextJobNo() {
  const year = new Date().getFullYear()
  const res = await runTransaction(dbRef(db, `counters/jobs/${year}`), (v) => (v || 0) + 1)
  if (!res.committed) throw new Error('counter')
  return `WO${year}-${String(res.snapshot.val()).padStart(4, '0')}`
}

/**
 * Create a repair request. `form` = { buildingId, areaId, locationDetail, jobTypeId, description, priority,
 * name, phone, email, department, gps, lang }, `images` = compressed images from compressImage().
 */
export async function createJob(form, images, user) {
  const jobNo = await nextJobNo()
  const jobId = push(dbRef(db, 'jobs')).key
  const code = randomCode(8)
  const eventId = push(dbRef(db, `jobEvents/${jobId}`)).key
  const now = serverTimestamp()
  const job = {
    jobNo, trackingCode: code, status: 'new', priority: form.priority || 'normal',
    jobTypeId: form.jobTypeId, buildingId: form.buildingId, areaId: form.areaId || null,
    locationDetail: form.locationDetail || '', gps: form.gps || null, description: form.description,
    reporterUid: user.uid,
    reporter: { name: form.name, email: form.email, phone: form.phone, department: form.department || '' },
    lang: form.lang || 'th', pdpaAt: now, createdAt: now, updatedAt: now
  }
  const event = { at: now, byUid: user.uid, byName: form.name, type: 'created', to: 'new', note: '', public: true }
  const tracking = {
    jobId, jobNo, status: 'new', jobTypeId: job.jobTypeId, buildingId: job.buildingId, areaId: job.areaId,
    createdAt: now, updatedAt: now, timeline: { [eventId]: { at: now, type: 'created', to: 'new', note: '' } }
  }
  await update(dbRef(db), {
    [`jobs/${jobId}`]: job,
    [`tracking/${code}`]: tracking,
    [`jobEvents/${jobId}/${eventId}`]: event
  })
  // Photos after the job exists (rules check ownership)
  for (const img of images || []) {
    try {
      const { pid, meta } = await uploadJobPhoto(jobId, img, user.uid)
      await update(dbRef(db, `jobs/${jobId}/photos`), { [pid]: meta })
    } catch (e) { console.warn('photo upload failed', e) }
  }
  return { jobId, jobNo, trackingCode: code }
}

/**
 * Apply a change to a job: one atomic multi-path update of the job, its public tracking mirror and a new event.
 * patch: fields to set on jobs/{id} (null deletes). event: { type, from?, to?, note?, public }
 */
export async function applyJobChange(job, patch, event, actor) {
  const now = serverTimestamp()
  const id = job.id
  const updates = {}
  const full = { ...patch, updatedAt: now }
  for (const [k, v] of Object.entries(full)) {
    updates[`jobs/${id}/${k}`] = v ?? null
    if (PUBLIC_FIELDS.includes(k)) updates[`tracking/${job.trackingCode}/${k}`] = publicValue(k, v)
  }
  if (event) {
    const eid = push(dbRef(db, `jobEvents/${id}`)).key
    const ev = { at: now, byUid: actor.uid, byName: actor.name || '', type: event.type, from: event.from ?? null, to: event.to ?? null, note: event.note || '', public: !!event.public }
    updates[`jobEvents/${id}/${eid}`] = ev
    if (ev.public) updates[`tracking/${job.trackingCode}/timeline/${eid}`] = { at: now, type: ev.type, to: ev.to, note: ev.note }
  }
  await update(dbRef(db), updates)
}

function publicValue(k, v) {
  if (k === 'hold' && v) return { reason: v.reason || 'other', note: v.note || '', resumeDate: v.resumeDate || null, partsEta: v.partsEta || null, since: v.since || null }
  return v ?? null
}

/* ---------- workflow helpers ---------- */
export const actorOf = (authState) => ({ uid: authState.user.uid, name: authState.profile?.displayName || authState.user.displayName || authState.user.email })

export function changeStatus(job, to, actor, { note = '', extra = {} } = {}) {
  const patch = { status: to, ...extra }
  if (to !== 'on_hold') patch.hold = null
  if (to === 'completed') patch.completedAt = serverTimestamp()
  if (to !== 'completed' && job.completedAt) patch.completedAt = null
  return applyJobChange(job, patch, { type: 'status', from: job.status, to, note, public: true }, actor)
}

export function putOnHold(job, hold, actor) {
  const h = { reason: hold.reason, note: hold.note || '', resumeDate: hold.resumeDate || null, partsEta: hold.partsEta || null, since: Date.now() }
  const patch = { status: 'on_hold', hold: h }
  // If staff gave a parts ETA / resume date beyond the current expected date, push expectedDate along so the reporter sees it
  const next = Math.max(h.partsEta || 0, h.resumeDate || 0)
  if (next && (!job.expectedDate || next > job.expectedDate)) patch.expectedDate = next
  return applyJobChange(job, patch, { type: 'hold', from: job.status, to: h.reason, note: h.note, public: true }, actor)
}

export function assignJob(job, assignee, actor) {
  const patch = { assigneeUid: assignee.uid, assigneeName: assignee.name }
  if (job.status === 'new') patch.status = 'assigned'
  return applyJobChange(job, patch, { type: 'assign', from: job.assigneeName || null, to: assignee.name, public: true }, actor)
}

export function setExpected(job, expectedDate, expectedNote, actor) {
  return applyJobChange(job, { expectedDate: expectedDate || null, expectedNote: expectedNote || '' },
    { type: 'expected', to: expectedDate ? String(expectedDate) : null, note: expectedNote || '', public: true }, actor)
}

export function addComment(job, note, isPublic, actor) {
  return applyJobChange(job, {}, { type: 'comment', note, public: isPublic }, actor)
}

export async function addPhotos(job, images, actor) {
  for (const img of images) {
    const { pid, meta } = await uploadJobPhoto(job.id, img, actor.uid)
    await update(dbRef(db, `jobs/${job.id}/photos`), { [pid]: meta })
  }
  await applyJobChange(job, {}, { type: 'photo', note: String(images.length), public: false }, actor)
}

/* ---------- listeners ---------- */
const listen = (q, cb, err) => onValue(q, (s) => cb(toArray(s.val()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))), err || ((e) => console.warn(e)))

export const listenAllJobs = (cb, limit = 1000, err) => listen(query(dbRef(db, 'jobs'), orderByChild('createdAt'), limitToLast(limit)), cb, err)
export const listenMyJobs = (uid, cb, err) => listen(query(dbRef(db, 'jobs'), orderByChild('reporterUid'), equalTo(uid)), cb, err)
export const listenAssignedJobs = (uid, cb, err) => listen(query(dbRef(db, 'jobs'), orderByChild('assigneeUid'), equalTo(uid)), cb, err)

export const listenJob = (id, cb, err) => onValue(dbRef(db, `jobs/${id}`), (s) => cb(s.exists() ? { id, ...s.val() } : null), err)
export const listenEvents = (id, cb, err) => onValue(dbRef(db, `jobEvents/${id}`), (s) => cb(toArray(s.val()).sort((a, b) => (a.at || 0) - (b.at || 0))), err)
export const listenTracking = (code, cb, err) => onValue(dbRef(db, `tracking/${code}`), (s) => cb(s.val()), err)

export async function listAssignableStaff() {
  const out = []
  for (const r of ['technician', 'contractor', 'admin']) {
    const s = await get(query(dbRef(db, 'users'), orderByChild('role'), equalTo(r)))
    toArray(s.val()).forEach((u) => out.push({ uid: u.id, name: u.displayName || u.email, role: u.role, company: u.company || '' }))
  }
  return out
}
