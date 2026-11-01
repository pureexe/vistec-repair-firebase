#!/usr/bin/env node
/**
 * Import jobs + master data from the old CPFM system (enco.bi-cpfm.com) into our Realtime Database.
 * The old system wins: every run overwrites the imported fields with what CPFM currently shows.
 * Data that exists only in the new system (photos, GPS, events written by the new app) is kept.
 *
 *   npm run import:cpfm -- --dry-run            # scrape + build the write, save it to .cpfm-cache/, write nothing
 *   npm run import:cpfm                         # scrape + write to Firebase
 *   npm run import:cpfm -- --site=VISTEC --limit=50 --no-notes
 *
 * Flags:
 *   --dry-run         don't write to Firebase (still reads it if credentials are set)
 *   --site=A,B        CPFM site codes to import (default: all = THEENCONY,PTTEP,VISTEC,KVIS)
 *   --from=YYYY-MM-DD only jobs reported on/after this date
 *   --limit=N         at most N jobs per site (newest first) — for testing
 *   --no-notes        skip the per-job activity log (one HTTP request per job)
 *   --no-files        skip attachments (another HTTP request per job, plus the downloads)
 *   --photos=MODE     where attached photos go: storage | rtdb | link (default: VITE_IMAGE_STORE).
 *                     storage/rtdb = shrink to ≤1280×720 WebP like the app does; link = keep a link to the old server.
 *                     Videos and other files are always kept as links (jobs/{id}/files).
 *   --refresh-notes   re-download every job's activity log and attachment list, ignoring the cache
 *   --concurrency=N   parallel note requests (default 4 — be gentle with the old server)
 *   --force           rewrite every job even if nothing changed
 *
 * Needs in .env: EXISTING_SYSTEM_URL, EXISTING_SYSTEM_USERNAME, EXISTING_SYSTEM_PASSWORD,
 * VITE_FIREBASE_DATABASE_URL and (unless --dry-run) FIREBASE_SERVICE_ACCOUNT=path/to/service-account.json
 * (Firebase console → Project settings → Service accounts → Generate new private key).
 * To try it locally instead, start the emulator and set FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000.
 *
 * How the old site works and how this maps onto our tree: CPFM_IMPORT.md
 */
import { createHash, randomInt } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jobIndex } from '../src/services/jobIndex.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, '.cpfm-cache')
try { process.loadEnvFile(join(ROOT, '.env')) } catch {}

/* ---------------- options ---------------- */
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/)
  return m ? [m[1], m[2] ?? true] : [a, true]
}))
const DRY = !!argv['dry-run']
const NOTES = !argv['no-notes']
const FILES = !argv['no-files']
const PHOTOS = String(argv.photos || process.env.VITE_IMAGE_STORE || 'storage')
if (!['storage', 'rtdb', 'link'].includes(PHOTOS)) die('--photos must be storage, rtdb or link')
const FORCE = !!argv.force
const CONC = Number(argv.concurrency || 4)
const LIMIT = argv.limit ? Number(argv.limit) : Infinity
const FROM = argv.from || ''
const SITES_WANTED = argv.site ? String(argv.site).split(',').map((s) => s.trim().toUpperCase()) : null

const BASE = (process.env.EXISTING_SYSTEM_URL || 'https://enco.bi-cpfm.com/').replace(/\/?$/, '/')
const USER = process.env.EXISTING_SYSTEM_USERNAME
const PASS = process.env.EXISTING_SYSTEM_PASSWORD
if (!USER || !PASS) die('EXISTING_SYSTEM_USERNAME / EXISTING_SYSTEM_PASSWORD missing in .env')

function die(msg) { console.error('✖ ' + msg); process.exit(1) }
const log = (...a) => console.log(...a)

/* ---------------- CPFM http ---------------- */
let cookie = ''
async function login() {
  const body = new URLSearchParams({ login_user: USER, login_password: PASS, action_alert: 'js', action_login: 'ok', url: '', login_type: 'A' })
  const res = await fetch(BASE + 'option/logincheck.php', { method: 'POST', body, redirect: 'manual' })
  const sc = res.headers.getSetCookie().map((c) => c.split(';')[0]).filter((c) => c.startsWith('PHPSESSID='))
  if (sc.length) cookie = sc.at(-1)
  const text = await res.text()
  if (!/login success/i.test(text)) die('CPFM login failed: ' + text.replace(/<[^>]+>/g, '').slice(0, 200))
}

async function call(path, params = {}, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(BASE + path, {
        method: 'POST', body: new URLSearchParams(params),
        headers: { cookie, 'x-requested-with': 'XMLHttpRequest' }, signal: AbortSignal.timeout(120000)
      })
      const text = await res.text()
      if (text.includes('session-expired')) { await login(); throw new Error('session expired') }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return parseLoose(text)
    } catch (e) {
      if (i >= tries) throw new Error(`${path}: ${e.message}`)
      await new Promise((r) => setTimeout(r, 1000 * i * i))
    }
  }
}

/** ExtJS endpoints answer `{total:12,data:[…]}` / `{success:true,data:[…]}` — quote the bare top-level keys. */
function parseLoose(text) {
  const t = text.trim().replace(/^﻿/, '')
  try { return JSON.parse(t) } catch {}
  return JSON.parse(t.replace(/([{,])\s*(total|data|success|message|msg)\s*:/g, '$1"$2":'))
}

const lookup = (q) => call('option/action.php', { act: 'settypelist', ...q }).then((d) => d.data || [])

/* ---------------- helpers ---------------- */
const hash = (s, n = 10) => createHash('sha1').update(s).digest('hex').slice(0, n)
const keySafe = (s) => String(s).trim().replace(/[.#$\[\]\/\s]+/g, '_')
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '')
const clean = (s) => String(s ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim()
const tsBkk = (s) => {
  if (!s || s.startsWith('0000')) return null
  const iso = s.length <= 10 ? `${s}T00:00:00+07:00` : s.replace(' ', 'T') + '+07:00'
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // same alphabet as src/services/util.js
const randomCode = () => Array.from({ length: 8 }, () => ALPHA[randomInt(ALPHA.length)]).join('')
const emailKey = (e) => String(e || '').trim().toLowerCase()

/** "อาคาร R1.1 ชั้น2" → { building: "อาคาร R1.1", floor: "ชั้น 2" }; no floor → floor null */
function splitLocation(name) {
  const n = clean(name)
  const m = n.match(/^(.*?)\s*(ชั้น\s*\S+)$/)
  if (m && m[1]) return { building: clean(m[1]), floor: m[2].replace(/^ชั้น\s*/, 'ชั้น ') }
  return { building: n, floor: null }
}
const floorEn = (f) => { const x = f.replace(/^ชั้น\s*/, ''); return /^\d+$/.test(x) ? `Floor ${x}` : '' }

/** "ระบบไฟฟ้า Electrical system" → { th: "ระบบไฟฟ้า", en: "Electrical system" } */
function splitThEn(name) {
  const n = clean(name)
  const i = n.search(/[A-Za-z]/)
  if (i <= 0) return { th: n, en: i === 0 ? n : '' }
  return { th: clean(n.slice(0, i)) || n, en: clean(n.slice(i)) }
}

const SITE_EN = { THEENCONY: 'The Encony', PTTEP: 'PTTEP', VISTEC: 'VISTEC', KVIS: 'KVIS' }
// CPFM job-type code → nameEn of the type created by "สร้างข้อมูลตั้งต้น" (src/services/master.js), so we reuse it
const TYPE_ALIAS = {
  EE: 'Electrical', AC: 'Air-con & Ventilation', SN: 'Sanitary & Plumbing', BD: 'Building / Architecture', ICT: 'IT / Network',
  FA: 'Fire Alarm', Contractor: 'Contractor', 'V-Fix it': 'Scientific Instrument', OT: 'Other', LAB: 'Laboratory equipment',
  EL: 'Elevator / Lift', PM: 'Machine maintenance'
}
const STATUS = { 1: 'new', 2: 'in_progress', 3: 'on_hold', 4: 'completed', 5: 'cancelled' }
const PRIORITY = { N: 'normal', H: 'urgent', L: 'low', D: 'callback' }
function holdReason(note) {
  if (/อะไหล่|วัสดุ|อุปกรณ์|สั่งซื้อ|part/i.test(note)) return 'waiting_parts'
  if (/งบ|budget|การเงิน|จัดซื้อ/i.test(note)) return 'budget'
  if (/ผู้รับเหมา|บริษัท|contractor|vendor/i.test(note)) return 'contractor'
  if (/นัด|เข้าพื้นที่|access/i.test(note)) return 'access'
  return 'other'
}

async function pool(items, n, fn) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k) }
  }))
}

/* ---------------- Firebase ---------------- */
async function openDb() {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (process.env.FIREBASE_DATABASE_EMULATOR_HOST) { // local test: firebase emulators:start --only database
    const { initializeApp } = await import('firebase-admin/app')
    const { getDatabase } = await import('firebase-admin/database')
    fbApp = initializeApp({ projectId: process.env.VITE_FIREBASE_PROJECT_ID, databaseURL: process.env.VITE_FIREBASE_DATABASE_URL })
    return getDatabase(fbApp)
  }
  if (!sa) {
    if (DRY) { log('ℹ no FIREBASE_SERVICE_ACCOUNT — dry run against an empty database'); return null }
    die('FIREBASE_SERVICE_ACCOUNT=path/to/service-account.json missing in .env (or use --dry-run)')
  }
  const { initializeApp, cert } = await import('firebase-admin/app')
  const { getDatabase } = await import('firebase-admin/database')
  // never pour 25k reporters' names / phones / e-mails into a database that is still in open test mode
  const probe = await fetch(`${process.env.VITE_FIREBASE_DATABASE_URL}/jobs.json?shallow=true`).catch(() => null)
  if (probe?.ok && !argv['allow-open-db']) die('the database is readable without signing in — publish database.rules.json first (README §1.2)')
  fbApp = initializeApp({
    credential: cert(JSON.parse(readFileSync(resolve(ROOT, sa), 'utf8'))),
    databaseURL: process.env.VITE_FIREBASE_DATABASE_URL, storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET
  })
  return getDatabase(fbApp)
}
let fbApp = null

/* ---------------- attachments ---------------- */
const IMG = /^(jpe?g|png|webp|gif|tiff?|bmp|heic|heif)$/i
const fileUrl = (f) => BASE + 'files/' + String(f.f_url).split('/').map(encodeURIComponent).join('/')

/** Download a CPFM photo once and shrink it the way src/services/images.js does (≤1280×720, WebP q72). Cached. */
async function webpOf(f) {
  const out = join(CACHE, 'photos', `${f.f_id}.webp`)
  const metaFile = out + '.json'
  if (existsSync(out) && existsSync(metaFile)) return { buf: readFileSync(out), ...JSON.parse(readFileSync(metaFile, 'utf8')) }
  const res = await fetch(fileUrl(f), { signal: AbortSignal.timeout(120000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const { default: sharp } = await import('sharp')
  let src = Buffer.from(await res.arrayBuffer())
  if (/^hei[cf]$/i.test(f.f_type)) { // iPhone photos — prebuilt sharp has no HEVC decoder
    const { default: heicConvert } = await import('heic-convert')
    src = Buffer.from(await heicConvert({ buffer: src, format: 'JPEG', quality: 0.9 }))
  }
  const m = await sharp(src).metadata()
  let [w, h] = [m.width, m.height]
  if (m.orientation >= 5) [w, h] = [h, w]
  const k = Math.min(1, w >= h ? Math.min(1280 / w, 720 / h) : Math.min(720 / w, 1280 / h))
  const { data, info } = await sharp(src).rotate().resize(Math.round(w * k), Math.round(h * k)).webp({ quality: 72 }).toBuffer({ resolveWithObject: true })
  const meta = { w: info.width, h: info.height, bytes: data.length }
  writeFileSync(out, data)
  writeFileSync(metaFile, JSON.stringify(meta))
  return { buf: data, ...meta }
}
const readAll = async (db, path) => (db ? (await db.ref(path).get()).val() || {} : {})

/* ================================================================= */
async function main() {
  for (const d of ['notes', 'docs', 'photos']) mkdirSync(join(CACHE, d), { recursive: true })
  log(`→ CPFM ${BASE} as ${USER}${DRY ? '  (dry run)' : ''}`)
  await login()

  const db = await openDb()
  log('→ reading current Firebase data')
  const cur = {}
  for (const k of ['sites', 'buildings', 'areas', 'jobTypes', 'users', 'jobs']) cur[k] = await readAll(db, k)
  let bucket = null
  if (FILES && PHOTOS === 'storage' && !DRY) {
    const { getStorage } = await import('firebase-admin/storage')
    bucket = getStorage(fbApp).bucket()
    const [ok] = await bucket.exists().catch((e) => die(`Storage: ${e.message}`))
    if (!ok) die(`Storage bucket ${bucket.name} does not exist — enable Storage (Blaze plan) or run with --photos=link (or rtdb)`)
  }
  const photoJobs = [] // { jobId, pid, f, at } — downloaded + stored after the scrape

  const up = {} // one big multi-path update, flushed in chunks
  const stats = { sites: 0, buildings: 0, areas: 0, jobTypes: 0, jobsNew: 0, jobsChanged: 0, jobsSame: 0, events: 0, notesFetched: 0, docsFetched: 0, photos: 0, fileLinks: 0, photoErrors: 0, reindexed: 0 }
  const set = (path, obj) => { for (const [k, v] of Object.entries(obj)) up[`${path}/${k}`] = v ?? null }
  const findBy = (coll, pred) => Object.entries(cur[coll]).find(([, v]) => v && pred(v))?.[0]

  /* ---------- sites ---------- */
  const roots = await lookup({ type_category: 'location', authen_location: 'y', type_parent: '0', order_by: 'type_name' })
  const sites = {} // cpfm code (trimmed) → { id, rawCode, nameTh }
  for (const r of roots) {
    const code = r.type_code.trim()
    if (SITES_WANTED && !SITES_WANTED.includes(code)) continue
    const id = findBy('sites', (v) => v.cpfm?.code === code || v.code === code) || `cpfm_${keySafe(code)}`
    sites[code] = { id, rawCode: r.type_code, nameTh: clean(r.type_name) }
    set(`sites/${id}`, { code, nameTh: clean(r.type_name), nameEn: SITE_EN[code] || code, order: Number(r.type_order) || 0, active: r.type_status === '1', cpfm: { id: r.type_id, code } })
    if (!cur.sites[id]) stats.sites++
  }
  if (!Object.keys(sites).length) die('no matching sites — check --site')

  /* ---------- buildings & areas ---------- */
  const buildingIds = {} // key → id
  const areaIds = {}
  let bOrder = 0
  function building(siteCode, name, code = '') {
    const site = sites[siteCode]
    const isSite = norm(name) === norm(site.nameTh) || !name
    const key = `${siteCode}|${isSite ? '*' : norm(name)}`
    if (buildingIds[key]) return buildingIds[key]
    // the site-wide building reuses an existing building with the site's code (e.g. the seeded "VISTEC" building)
    const id = findBy('buildings', (v) => v.cpfm?.key === key) ||
      (isSite && findBy('buildings', (v) => !v.cpfm && v.code === siteCode)) ||
      `cpfm_b_${hash(key)}`
    buildingIds[key] = id
    const prev = cur.buildings[id] || {}
    set(`buildings/${id}`, {
      siteId: site.id, nameTh: isSite ? (prev.nameTh || site.nameTh) : clean(name), nameEn: prev.nameEn || (isSite ? SITE_EN[siteCode] || '' : ''),
      code: prev.code || code || (isSite ? siteCode : ''), order: isSite ? 0 : ++bOrder, active: prev.active ?? true, cpfm: { key }
    })
    if (!cur.buildings[id]) stats.buildings++
    return id
  }
  function area(siteCode, bName, floor) {
    const bId = building(siteCode, bName)
    if (!floor) return { buildingId: bId, areaId: null }
    const key = `${siteCode}|${norm(bName)}|${norm(floor)}`
    if (!areaIds[key]) {
      const id = findBy('areas', (v) => v.cpfm?.key === key) || `cpfm_a_${hash(key)}`
      areaIds[key] = id
      const prev = cur.areas[id] || {}
      set(`areas/${id}`, { buildingId: bId, nameTh: floor, nameEn: prev.nameEn || floorEn(floor), order: Number(floor.replace(/\D/g, '')) || 99, active: prev.active ?? true, cpfm: { key } })
      if (!cur.areas[id]) stats.areas++
    }
    return { buildingId: bId, areaId: areaIds[key] }
  }
  const locByCode = {} // CPFM location code → { siteId, buildingId, areaId }
  const subs = await lookup({ type_category: 'location', authen_location: 'y', type_parent: 'sub', order_by: 'type_parent,t.type_order', partial: 'y' })
  for (const s of subs) {
    const siteCode = s.type_parent.trim()
    if (!sites[siteCode]) continue
    const { building: bName, floor } = splitLocation(s.type_name)
    const where = area(siteCode, bName, floor)
    if (!floor) up[`buildings/${where.buildingId}/code`] = cur.buildings[where.buildingId]?.code || s.type_code.trim()
    locByCode[s.type_code.trim()] = { siteId: sites[siteCode].id, ...where }
  }
  /** Location of a job; unknown codes fall back to the name in the grid, then to the site-wide building. */
  function locate(siteCode, row) {
    const hit = locByCode[(row.task_location || '').trim()]
    if (hit && hit.siteId === sites[siteCode].id) return hit
    const last = String(row.location || '').split('>').pop()
    const { building: bName, floor } = splitLocation(last)
    return { siteId: sites[siteCode].id, ...area(siteCode, bName, floor) }
  }

  /* ---------- job types ---------- */
  const typeIds = {}
  function jobType(code, name, active, order) {
    if (typeIds[code]) return typeIds[code]
    const alias = TYPE_ALIAS[code]
    const id = findBy('jobTypes', (v) => v.cpfm?.code === code) ||
      (alias && findBy('jobTypes', (v) => !v.cpfm && v.nameEn === alias)) || `cpfm_t_${keySafe(code) || 'none'}`
    typeIds[code] = id
    const { th, en } = splitThEn(name || code)
    const prev = cur.jobTypes[id] || {}
    set(`jobTypes/${id}`, { nameTh: th, nameEn: en || prev.nameEn || '', icon: prev.icon || 'mdi-wrench', order: order ?? prev.order ?? 99, active, cpfm: { code } })
    if (!cur.jobTypes[id]) stats.jobTypes++
    return id
  }
  const types = await lookup({ type_category: 'tasktype', order_by: 'type_order' })
  types.forEach((t, i) => jobType(t.type_code, t.type_name, t.type_status === '1', i + 1))

  /* ---------- users by e-mail (so people see their old jobs under "My jobs") ---------- */
  const uidByEmail = {}
  for (const [uid, u] of Object.entries(cur.users)) if (u?.email) uidByEmail[emailKey(u.email)] = uid
  const ownJobNos = new Set(Object.values(cur.jobs).filter((j) => j && !j.cpfm).map((j) => j.jobNo))

  /* ---------- jobs ---------- */
  const counters = {}
  const conflicts = []
  for (const [siteCode, site] of Object.entries(sites)) {
    const rows = []
    for (let start = 0; ; start += 1000) {
      const params = { start, limit: Math.min(1000, LIMIT - rows.length), sort: 'task_id', dir: 'DESC', locationgroup: site.rawCode }
      if (FROM) params.order_date = FROM
      const d = await call('tasks/tasks_action.php?menu=&status_type=tasks&authen_location=y&act=grid&mode=', params)
      rows.push(...d.data)
      log(`  ${siteCode}: ${rows.length}/${Math.min(Number(d.total), LIMIT)} jobs`)
      if (!d.data.length || rows.length >= Number(d.total) || rows.length >= LIMIT) break
    }

    // activity log + attachment list, cached per job and re-fetched only when the job changed (or is still open)
    const notes = {}
    const docs = {}
    async function cached(kind, r, fetchIt) {
      const f = join(CACHE, kind, `${r.task_id}.json`)
      const stamp = `${r.users_update || r.users_date}|${r.task_status}`
      const open = ['1', '2', '3'].includes(r.task_status)
      if (!argv['refresh-notes'] && !open && existsSync(f)) {
        const c = JSON.parse(readFileSync(f, 'utf8'))
        if (c.stamp === stamp) return [c.data, false]
      }
      const data = (await fetchIt()).data || []
      writeFileSync(f, JSON.stringify({ stamp, data }))
      return [data, true]
    }
    if (NOTES || FILES) {
      let done = 0
      await pool(rows, CONC, async (r) => {
        let fetched = false
        if (NOTES) {
          const [d, f] = await cached('notes', r, () => call('notes/note_action.php', { act: 'grid', row_type: 'tasks', row_id: r.task_id, start: 0, limit: 500 }))
          notes[r.task_id] = d; if (f) { stats.notesFetched++; fetched = true }
        }
        if (FILES) {
          // the grid's attach_files column is always 0 — the only way to know is to ask per job
          const [d, f] = await cached('docs', r, () => call(`document/document_action.php?menu=&status_type=document&row_id=${r.task_id}&row_type=tasks&category=&act=grid`, { start: 0, limit: 100 }))
          docs[r.task_id] = d; if (f) { stats.docsFetched++; fetched = true }
        }
        if (fetched && ++done % 200 === 0) log(`  ${siteCode}: activity logs / attachments for ${done} jobs downloaded`)
      })
    }

    for (const r of rows) {
      const id = `cpfm_${r.task_id}`
      const prev = cur.jobs[id]
      const where = locate(siteCode, r)
      const status = STATUS[r.task_status] || 'new'
      const createdAt = tsBkk(r.users_date) || tsBkk(r.task_date) || Date.now()
      const updatedAt = tsBkk(r.users_update) || tsBkk(r.task_status_date) || createdAt
      const jobNo = r.task_code
      const y = jobNo.match(/^WO(\d{4})-(\d+)$/)
      if (y) counters[y[1]] = Math.max(counters[y[1]] || 0, Number(y[2]))
      if (ownJobNos.has(jobNo)) conflicts.push(jobNo)

      /* events from the activity log */
      const evs = {}
      let lastHold = ''
      for (const n of notes[r.task_id] || []) {
        const st = clean(n.note_status)
        if (/^sent mail$/i.test(st)) continue
        const note = clean(n.note_detail).slice(0, 3000)
        const ev = { at: tsBkk(n.users_date) || createdAt, byUid: 'cpfm', byName: clean(n.users_date_by === 'guest' ? n.note_title : n.users_date_by), from: null, to: null, note, public: true, imported: true }
        if (st === 'แจ้งงานใหม่') Object.assign(ev, { type: 'created', to: 'new', note: '' })
        else if (/^มอบหมายงานให้/.test(note)) Object.assign(ev, { type: 'assign', to: clean(note.replace(/^มอบหมายงานให้/, '')) || null, note: '' })
        else if (/หยุด/.test(st)) { Object.assign(ev, { type: 'hold', to: holdReason(note) }); lastHold = note }
        else if (/เสร็จสิ้น/.test(st)) Object.assign(ev, { type: 'status', to: 'completed' })
        else if (/ยกเลิก/.test(st)) Object.assign(ev, { type: 'status', to: 'cancelled' })
        else if (/ดำเนินการ/.test(st)) Object.assign(ev, { type: 'status', to: 'in_progress' })
        else Object.assign(ev, { type: 'comment', public: false })
        evs[`cpfm_${n.note_id}`] = ev
      }
      if (!Object.values(evs).some((e) => e.type === 'created')) {
        evs.cpfm_created = { at: createdAt, byUid: 'cpfm', byName: clean(r.task_by), from: null, to: 'new', note: '', public: true, imported: true, type: 'created' }
      }

      const holdNote = clean(lastHold || r.task_remark).slice(0, 1000)
      const hold = status === 'on_hold' ? { reason: holdReason(holdNote), note: holdNote, resumeDate: null, partsEta: null, since: tsBkk(r.task_status_date) || updatedAt } : null
      const email = clean(r.task_by_email)
      const job = {
        jobNo, status, priority: PRIORITY[r.task_priority] || 'normal',
        siteId: where.siteId, buildingId: where.buildingId, areaId: where.areaId,
        jobTypeId: jobType(r.task_type || 'OT', r.typename || r.task_title, false),
        locationDetail: '', description: clean(r.task_detail).slice(0, 3000) || clean(r.task_title) || '-',
        reporterUid: uidByEmail[emailKey(email)] || 'cpfm',
        reporter: { name: clean(r.task_by).slice(0, 120), email: email.slice(0, 160), phone: clean(r.task_by_tel).slice(0, 40), department: clean(r.task_by_dept).slice(0, 120) },
        lang: 'th', pdpaAt: createdAt,
        assigneeUid: null, assigneeName: clean(r.actionby).slice(0, 120) || null,
        expectedDate: tsBkk(r.duedate), expectedNote: '',
        hold, workDetail: clean(r.task_action).slice(0, 3000),
        createdAt, updatedAt,
        completedAt: status === 'completed' ? tsBkk(r.donetime) || tsBkk(r.task_status_date) || updatedAt : null,
        cpfm: { id: r.task_id, location: (r.task_location || '').trim(), type: r.task_type || '', by: clean(r.users_date_by), rating: r.rate_star ? { star: Number(r.rate_star), comment: clean(r.rate_comment) } : null }
      }
      job.idx = jobIndex(job)

      /* attachments: photos → our photo store (later, in parallel); everything else → a link to the old server */
      for (const f of docs[r.task_id] || []) {
        if (f.f_status === '0' || !f.f_url) continue
        const pid = `cpfm_f${f.f_id}`
        const at = tsBkk(f.users_date) || createdAt
        if (PHOTOS !== 'link' && IMG.test(f.f_type || '')) {
          if (!prev?.photos?.[pid]) photoJobs.push({ jobId: id, pid, f, at })
          continue
        }
        const link = { name: clean(f.f_name).slice(0, 200) || pid, url: fileUrl(f), type: String(f.f_type || '').toLowerCase(), bytes: Number(f.f_size) || 0, by: clean(f.users_date_by), at }
        if (JSON.stringify(prev?.files?.[pid]) !== JSON.stringify(link)) { up[`jobs/${id}/files/${pid}`] = link; stats.fileLinks++ }
      }

      const h = hash(JSON.stringify([job, evs]), 16)
      if (prev && prev.cpfm?.hash === h && !FORCE) { stats.jobsSame++; continue }
      job.cpfm.hash = h
      prev ? stats.jobsChanged++ : stats.jobsNew++

      const code = prev?.trackingCode || randomCode()
      set(`jobs/${id}`, { ...job, trackingCode: code })
      for (const [eid, ev] of Object.entries(evs)) {
        up[`jobEvents/${id}/${eid}`] = ev
        if (ev.public) up[`tracking/${code}/timeline/${eid}`] = { at: ev.at, type: ev.type, to: ev.to, note: ev.type === 'created' ? '' : ev.note }
        stats.events++
      }
      set(`tracking/${code}`, {
        jobId: id, jobNo, status, siteId: job.siteId, jobTypeId: job.jobTypeId, buildingId: job.buildingId, areaId: job.areaId,
        createdAt, updatedAt, expectedDate: job.expectedDate, expectedNote: '', hold: hold && { ...hold }
      })
    }
  }

  /* ---------- photos: download once (cached), shrink, store ---------- */
  if (photoJobs.length && DRY) log(`dry run: ${photoJobs.length} photos would be downloaded and stored (${PHOTOS})`)
  if (photoJobs.length && !DRY) {
    log(`→ ${photoJobs.length} photos → ${PHOTOS}`)
    let done = 0
    await pool(photoJobs, CONC, async ({ jobId, pid, f, at }) => {
      try {
        const img = await webpOf(f)
        const meta = { w: img.w, h: img.h, bytes: img.bytes, by: 'cpfm', at, name: clean(f.f_name).slice(0, 200) }
        if (PHOTOS === 'rtdb') {
          up[`jobPhotos/${jobId}/${pid}`] = 'data:image/webp;base64,' + img.buf.toString('base64')
          up[`jobs/${jobId}/photos/${pid}`] = { ...meta, store: 'rtdb' }
        } else {
          const path = `jobs/${jobId}/${pid}.webp`
          const token = createHash('sha1').update(path + Date.now()).digest('hex')
          await bucket.file(path).save(img.buf, { contentType: 'image/webp', metadata: { cacheControl: 'public,max-age=31536000', metadata: { uid: 'cpfm', firebaseStorageDownloadTokens: token } } })
          const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`
          up[`jobs/${jobId}/photos/${pid}`] = { ...meta, store: 'storage', path, url }
        }
        stats.photos++
      } catch (e) {
        // HEIC the converter can't read, a broken file, a 404 … keep a link instead
        stats.photoErrors++
        up[`jobs/${jobId}/files/${pid}`] = { name: clean(f.f_name).slice(0, 200) || pid, url: fileUrl(f), type: String(f.f_type || '').toLowerCase(), bytes: Number(f.f_size) || 0, by: clean(f.users_date_by), at }
      }
      if (++done % 200 === 0) log(`  photos ${done}/${photoJobs.length}`)
    })
  }

  /* ---------- sort keys for jobs created in the new app (paged job list) ---------- */
  for (const [id, j] of Object.entries(cur.jobs)) {
    if (!j || j.cpfm || typeof j.createdAt !== 'number') continue
    const idx = jobIndex(j)
    if (JSON.stringify(idx) !== JSON.stringify(j.idx)) { up[`jobs/${id}/idx`] = idx; stats.reindexed++ }
  }

  /* ---------- write ---------- */
  log('\nSummary (new records):', JSON.stringify(stats))
  if (conflicts.length) log(`⚠ ${conflicts.length} job numbers exist both in CPFM and as jobs created in the new app (kept both): ${conflicts.slice(0, 10).join(', ')}…`)
  const paths = Object.keys(up)
  if (DRY) {
    const out = join(CACHE, 'dry-run.json')
    writeFileSync(out, JSON.stringify(up))
    log(`dry run: ${paths.length} paths written to ${out} — nothing sent to Firebase`)
    return
  }
  const CHUNK = 5000
  for (let i = 0; i < paths.length; i += CHUNK) {
    const part = {}
    for (const p of paths.slice(i, i + CHUNK)) part[p] = up[p]
    await db.ref().update(part)
    log(`  wrote ${Math.min(i + CHUNK, paths.length)}/${paths.length} paths`)
  }
  // new-app job numbers continue after the highest imported number of each year
  for (const [year, n] of Object.entries(counters)) {
    await db.ref(`counters/jobs/${year}`).transaction((v) => Math.max(v || 0, n))
  }
  await db.ref('config/cpfmImport').set({ at: Date.now(), stats })
  log('✔ done')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
