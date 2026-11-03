import {
  ref as dbRef, push, update, runTransaction, onValue, query, orderByChild, equalTo, limitToLast, serverTimestamp, get,
  startAt, endAt, endBefore
} from 'firebase/database'
import { db } from '../firebase.js'
import { toArray, normalizeJobNo, assigneeKeyString, JOB_PREFIX } from './util.js'
import { uploadJobPhoto } from './images.js'
import { jobIndex, jobIndexQuery } from './jobIndex.js'

// Fields of a job that are mirrored to the public /tracking/{jobNo} node (no personal data!)
const PUBLIC_FIELDS = ['status', 'jobTypeId', 'siteId', 'buildingId', 'areaId', 'expectedDate', 'expectedNote', 'hold', 'updatedAt']

// While CPFM still issues WO… numbers the app uses its own prefix, so a number never belongs to two jobs
async function nextJobNo() {
  const year = new Date().getFullYear()
  const prefix = (await get(dbRef(db, 'config/public/jobPrefix'))).val() || JOB_PREFIX
  const res = await runTransaction(dbRef(db, `counters/jobs/${prefix}${year}`), (v) => (v || 0) + 1)
  if (!res.committed) throw new Error('counter')
  return `${prefix}${year}-${String(res.snapshot.val()).padStart(4, '0')}`
}

/**
 * Create a repair request. `form` = { siteId, buildingId, areaId, locationDetail, jobTypeId, description, priority,
 * name, phone, email, department, gps, lang, assetId?, pm?, expectedDate? }, `images` = compressed images from compressImage().
 * assetId / pm / expectedDate are for staff (a work order for a machine, or from a PM plan — services/pm.js).
 */
export async function createJob(form, images, user) {
  const jobNo = await nextJobNo()
  const jobId = push(dbRef(db, 'jobs')).key
  const eventId = push(dbRef(db, `jobEvents/${jobId}`)).key
  const now = serverTimestamp()
  const job = {
    jobNo, status: 'new', priority: form.priority || 'normal',
    jobTypeId: form.jobTypeId, siteId: form.siteId || null, buildingId: form.buildingId, areaId: form.areaId || null,
    locationDetail: form.locationDetail || '', gps: form.gps || null, description: form.description,
    reporterUid: user.uid,
    reporter: { name: form.name, email: form.email, phone: form.phone, department: form.department || '' },
    lang: form.lang || 'th', pdpaAt: now, createdAt: now, updatedAt: now
  }
  if (form.assetId) job.assetId = form.assetId
  if (form.pm) job.pm = form.pm
  if (form.expectedDate) job.expectedDate = form.expectedDate
  job.idx = jobIndex(job, Date.now())
  const event = { at: now, byUid: user.uid, byName: form.name, type: 'created', to: 'new', note: '', public: true }
  const tracking = {
    jobId, jobNo, status: 'new', jobTypeId: job.jobTypeId, siteId: job.siteId, buildingId: job.buildingId, areaId: job.areaId,
    createdAt: now, updatedAt: now, expectedDate: job.expectedDate || null, timeline: { [eventId]: { at: now, type: 'created', to: 'new', note: '' } }
  }
  await update(dbRef(db), {
    [`jobs/${jobId}`]: job,
    [`tracking/${jobNo}`]: tracking,
    [`jobEvents/${jobId}/${eventId}`]: event
  })
  // Photos after the job exists (rules check ownership)
  for (const img of images || []) {
    try {
      const { pid, meta } = await uploadJobPhoto(jobId, img, user.uid)
      await update(dbRef(db, `jobs/${jobId}/photos`), { [pid]: meta })
    } catch (e) { console.warn('photo upload failed', e) }
  }
  return { jobId, jobNo }
}

/**
 * Apply a change to a job: one atomic multi-path update of the job, its public tracking mirror and a new event.
 * patch: fields to set on jobs/{id} (null deletes). event: { type, from?, to?, key?, note?, public }
 * extra: other paths written in the same update (e.g. /assignments)
 */
export async function applyJobChange(job, patch, event, actor, extra = {}) {
  const now = serverTimestamp()
  const id = job.id
  const updates = { ...extra }
  const full = { ...patch, updatedAt: now }
  // keep the list sort keys in step with anything they are built from
  if (['status', 'siteId', 'buildingId'].some((k) => k in patch)) full.idx = jobIndex({ ...job, ...patch })
  for (const [k, v] of Object.entries(full)) {
    updates[`jobs/${id}/${k}`] = v ?? null
    if (PUBLIC_FIELDS.includes(k)) updates[`tracking/${job.jobNo}/${k}`] = publicValue(k, v)
  }
  if (event) {
    const eid = push(dbRef(db, `jobEvents/${id}`)).key
    const ev = { at: now, byUid: actor.uid, byName: actor.name || '', type: event.type, from: event.from ?? null, to: event.to ?? null, key: event.key ?? null, note: event.note || '', public: !!event.public }
    updates[`jobEvents/${id}/${eid}`] = ev
    if (ev.public) updates[`tracking/${job.jobNo}/timeline/${eid}`] = { at: now, type: ev.type, to: ev.to, note: ev.note }
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

/* ผู้ปฏิบัติงาน: jobs/{id}/assignees/{key} = name, where key = the person's staff id (/staff) or, without one, their uid.
   assigneeKeys (",k1,k2,") is what the rules check; /assignments/{key}/{jobId} lets people list their own jobs. */
const assigneePatch = (assignees, key, name) => ({
  [`assignees/${key}`]: name,
  assigneeKeys: assigneeKeyString(assignees),
  assigneeName: Object.values(assignees).join(', ').slice(0, 300) || null
})

/** person = { key, name } from listAssignableStaff() */
export function addAssignee(job, person, actor) {
  const assignees = { ...(job.assignees || {}), [person.key]: person.name }
  const patch = assigneePatch(assignees, person.key, person.name)
  if (job.status === 'new') patch.status = 'assigned'
  return applyJobChange(job, patch, { type: 'assign', to: person.name, key: person.key, public: true }, actor,
    { [`assignments/${person.key}/${job.id}`]: true })
}

export function removeAssignee(job, key, actor) {
  const { [key]: name, ...assignees } = job.assignees || {}
  const patch = assigneePatch(assignees, key, null)
  if (job.status === 'assigned' && !Object.keys(assignees).length) patch.status = 'new'
  return applyJobChange(job, patch, { type: 'unassign', from: name || key, key, public: false }, actor,
    { [`assignments/${key}/${job.id}`]: null })
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

/* ---------- staff job list, one page at a time ---------- */
export const JOBS_PAGE = 50

/**
 * Live listener for one page of jobs, newest first. filter = { site, building, status: 'all'|'open'|<status> };
 * cursor = null for the first page, else the `next` from the previous page. cb({ jobs, next }) — next is null on the last page.
 */
export function listenJobsPage(filter, cursor, cb, err) {
  const { field, prefix } = jobIndexQuery(filter)
  const path = field === 'createdAt' ? 'createdAt' : `idx/${field}`
  const cons = [orderByChild(path)]
  if (prefix) cons.push(startAt(prefix))
  if (cursor) cons.push(endBefore(cursor.v, cursor.k))
  else if (prefix) cons.push(endAt(prefix + '\uf8ff'))
  cons.push(limitToLast(JOBS_PAGE + 1))
  return onValue(query(dbRef(db, 'jobs'), ...cons), (s) => {
    const rows = []
    s.forEach((c) => { rows.unshift({ id: c.key, ...c.val() }) }) // ascending → newest first
    const jobs = rows.slice(0, JOBS_PAGE)
    const last = jobs.at(-1)
    const v = (j) => (field === 'createdAt' ? j.createdAt : j.idx?.[field])
    cb({ jobs, next: rows.length > JOBS_PAGE && last ? { v: v(last), k: last.id } : null })
  }, err || ((e) => console.warn(e)))
}

/** Exact lookup by job number (WO2026-0123, VR2026-0001) across all jobs. */
export async function findJobs(text) {
  const no = normalizeJobNo(text)
  if (!no) return []
  return toArray((await get(query(dbRef(db, 'jobs'), orderByChild('jobNo'), equalTo(no)))).val())
}

export const listenAllJobs = (cb, limit = 1000, err) => listen(query(dbRef(db, 'jobs'), orderByChild('createdAt'), limitToLast(limit)), cb, err)
export const listenMyJobs = (uid, cb, err) => listen(query(dbRef(db, 'jobs'), orderByChild('reporterUid'), equalTo(uid)), cb, err)

/**
 * Live list of the jobs assigned to any of `keys` (the viewer's uid and linked staff id), newest first.
 * Reads /assignments/{key}, then each job — contractors may not query /jobs.
 */
export function listenAssignedJobs(keys, cb, err) {
  const ids = {} // key → job ids (undefined until loaded)
  const jobs = {} // jobId → { val, unsub }; val undefined until loaded
  const emit = () => {
    if (keys.some((k) => !ids[k]) || Object.values(jobs).some((j) => j.val === undefined)) return
    cb(Object.values(jobs).map((j) => j.val).filter(Boolean).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))
  }
  const sync = () => {
    const want = new Set(Object.values(ids).flat())
    for (const id of Object.keys(jobs)) if (!want.has(id)) { jobs[id].unsub(); delete jobs[id] }
    for (const id of want) {
      if (jobs[id]) continue
      const j = (jobs[id] = { val: undefined })
      j.unsub = onValue(dbRef(db, `jobs/${id}`), (s) => { j.val = s.exists() ? { id, ...s.val() } : null; emit() },
        () => { j.val = null; emit() })
    }
    emit()
  }
  const unsubs = keys.map((k) => onValue(dbRef(db, `assignments/${k}`), (s) => { ids[k] = Object.keys(s.val() || {}); sync() },
    (e) => { ids[k] = []; sync(); (err || console.warn)(e) }))
  return () => { unsubs.forEach((u) => u()); Object.values(jobs).forEach((j) => j.unsub?.()) }
}

export const listenJob = (id, cb, err) => onValue(dbRef(db, `jobs/${id}`), (s) => cb(s.exists() ? { id, ...s.val() } : null), err)
export const listenEvents = (id, cb, err) => onValue(dbRef(db, `jobEvents/${id}`), (s) => cb(toArray(s.val()).sort((a, b) => (a.at || 0) - (b.at || 0))), err)
export const listenTracking = (jobNo, cb, err) => onValue(dbRef(db, `tracking/${jobNo}`), (s) => cb(s.val()), err)

/**
 * People who can be put on a job: staff accounts (key = their linked staff id, else their uid) plus /staff records
 * that have no account yet (e.g. CPFM technicians). Returns [{ key, name, role, company, noAccount }].
 */
export async function listAssignableStaff() {
  const out = new Map()
  for (const r of ['technician', 'contractor', 'admin']) {
    const s = await get(query(dbRef(db, 'users'), orderByChild('role'), equalTo(r)))
    toArray(s.val()).forEach((u) => out.set(u.staffId || u.id, { key: u.staffId || u.id, name: u.displayName || u.email, role: u.role, company: u.company || '' }))
  }
  for (const p of toArray((await get(dbRef(db, 'staff'))).val())) {
    if (p.active === false || out.has(p.id)) continue
    out.set(p.id, { key: p.id, name: p.name, role: p.role || 'technician', company: p.company || '', noAccount: !p.uid })
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'))
}
