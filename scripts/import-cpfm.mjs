#!/usr/bin/env node
/**
 * Import jobs, assets, materials (stock card), PM plans + master data from the old CPFM system (enco.bi-cpfm.com)
 * into our Realtime Database.
 * The old system wins: every run overwrites the imported fields with what CPFM currently shows.
 * Data that exists only in the new system (photos, GPS, events written by the new app) is kept.
 *
 *   npm run import:cpfm -- --dry-run            # scrape + build the write, save it to .cpfm-cache/, write nothing
 *   npm run import:cpfm                         # scrape + write to Firebase
 *   npm run import:cpfm -- --site=VISTEC --limit=50 --no-notes
 *
 * Flags:
 *   --dry-run         don't write to Firebase (still reads it if credentials are set)
 *   --only=A,B        sections to import: jobs, assets (machines, repair log, materials, stock card), pm (default: all).
 *                     Sites, buildings, areas, job types and staff are always refreshed. `--only=assets,pm` touches no
 *                     photos (no Storage uploads) and takes a few minutes.
 *   --site=A,B        CPFM site codes to import (default: all = THEENCONY,PTTEP,VISTEC,KVIS)
 *   --from=YYYY-MM-DD only jobs reported on/after this date
 *   --limit=N         at most N jobs per site (newest first) — for testing
 *   --no-notes        skip the per-job activity log (one HTTP request per job)
 *   --no-files        skip attachments (another HTTP request per job, plus the downloads)
 *   --photos=MODE     where attached photos go: storage | rtdb | link (default: VITE_IMAGE_STORE).
 *                     storage/rtdb = shrink to ≤1280×720 WebP like the app does; link = keep a link to the old server.
 *                     Videos and other files are always kept as links (jobs/{id}/files).
 *   --photos-since=YYYY-MM-DD  only photos attached on/after this date are stored; older ones stay links
 *                     to the old server until a later run without the flag (or with an earlier date) stores
 *                     them and removes the link. Keeps one run under the 5,000 free Storage uploads a month.
 *   --refresh-notes   re-download every job's activity log and attachment list, ignoring the cache
 *   --concurrency=N   parallel note requests (default 4 — be gentle with the old server)
 *   --force           rewrite every job even if nothing changed
 *   --yes             really upload. Without it the run stops after printing the size / cost estimate
 *                     (the project is on the pay-as-you-go Blaze plan — someone must look at the numbers first)
 *   --accept-cost     with --yes, upload even when the estimate is over the free tier (otherwise it stops there)
 *
 * Needs in .env: EXISTING_SYSTEM_URL, EXISTING_SYSTEM_USERNAME, EXISTING_SYSTEM_PASSWORD,
 * VITE_FIREBASE_DATABASE_URL and (unless --dry-run) FIREBASE_SERVICE_ACCOUNT=path/to/service-account.json
 * (Firebase console → Project settings → Service accounts → Generate new private key).
 * To try it locally instead, start the emulator and set FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000.
 *
 * How the old site works and how this maps onto our tree: CPFM_IMPORT.md
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jobIndex } from '../src/services/jobIndex.js'
import { assigneeKeyString } from '../src/services/util.js'
import { occurrences } from '../src/services/pmSchedule.js'

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
const PHOTOS_SINCE = argv['photos-since'] ? String(argv['photos-since']) : ''
if (PHOTOS_SINCE && !/^\d{4}-\d{2}-\d{2}$/.test(PHOTOS_SINCE)) die('--photos-since must be YYYY-MM-DD')
const FORCE = !!argv.force
const CONC = Number(argv.concurrency || 4)
const LIMIT = argv.limit ? Number(argv.limit) : Infinity
const FROM = argv.from || ''
const SITES_WANTED = argv.site ? String(argv.site).split(',').map((s) => s.trim().toUpperCase()) : null
const ONLY = new Set(argv.only ? String(argv.only).split(',').map((s) => s.trim().toLowerCase()) : ['jobs', 'assets', 'pm'])
if ([...ONLY].some((x) => !['jobs', 'assets', 'pm'].includes(x))) die('--only takes jobs, assets, pm')
const JOBS = ONLY.has('jobs')

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
/** Every row of a CPFM grid, 1000 at a time */
async function grid(path, params = {}) {
  const rows = []
  for (let start = 0; ; start += 1000) {
    const d = await call(path, { start, limit: 1000, ...params })
    rows.push(...(d.data || []))
    if (!d.data?.length || rows.length >= Number(d.total)) return rows
  }
}
// authen_location=y only for machines: materials have no location, and the filter hides them all
const ASSET_GRID = (menu, cat, act) => `assets/assets_action.php?menu=${menu}&row_type=&row_id=&assetlocation=&assettype=assettype&asset_category=${cat}${cat === 'assets' ? '&authen_location=y' : ''}&act=${act}&status_type=assets`
const readAll = async (db, path) => (db ? (await db.ref(path).get()).val() || {} : {})

/**
 * Size of what a run sends, against the Blaze no-cost quotas (US bucket): RTDB 1 GB stored / 10 GB downloaded a month;
 * Storage 5 GB stored, 5,000 uploads (Class A) and 50,000 downloads (Class B) a month. Photos not yet converted are
 * counted at the average size of the ones already in the cache (≈30 KB).
 */
function estimate(up, photoJobs) {
  const MB = 1024 * 1024
  const dbBytes = Buffer.byteLength(JSON.stringify(up))
  const cached = existsSync(join(CACHE, 'photos')) ? readdirSync(join(CACHE, 'photos')).filter((f) => f.endsWith('.json')) : []
  const sizes = cached.map((f) => JSON.parse(readFileSync(join(CACHE, 'photos', f), 'utf8')).bytes)
  const avg = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 30 * 1024
  const photoBytes = photoJobs.length * avg
  const rtdbPhotos = PHOTOS === 'rtdb' ? photoBytes * 1.34 : 0
  const uploads = PHOTOS === 'storage' ? photoJobs.length : 0
  const numbers = { dbMB: (dbBytes + rtdbPhotos) / MB, photos: photoJobs.length, photoMB: photoBytes / MB, storageUploads: uploads, photoMode: PHOTOS }
  const over = []
  if (numbers.dbMB > 1024) over.push('RTDB storage > 1 GB')
  if (uploads > 5000) over.push(`Storage uploads ${uploads} > 5,000 free per month (≈ $${((uploads - 5000) / 1000 * 0.005).toFixed(2)} at $0.005 / 1,000)`)
  if (PHOTOS === 'storage' && numbers.photoMB > 5 * 1024) over.push('Storage > 5 GB')
  const text = [
    `  Realtime Database write: ${numbers.dbMB.toFixed(1)} MB (${Object.keys(up).length} paths) — free tier 1 GB stored`,
    `  photos: ${photoJobs.length} → ${PHOTOS}, ≈ ${numbers.photoMB.toFixed(0)} MB (avg ${(avg / 1024).toFixed(0)} KB)` +
      (uploads ? ` = ${uploads} Storage uploads — free tier 5,000 / month, 5 GB stored` : ''),
    over.length ? `  ⚠ over the free tier: ${over.join('; ')}` : '  ✓ within the free tier'
  ].join('\n')
  return { text, numbers: { ...numbers, overFreeTier: over } }
}

/* ---------------- เครื่องจักรและอุปกรณ์, วัสดุอุปกรณ์ (stock card), PM plans ---------------- */
const pmCounters = {} // yyyy → highest CPFM PM number (counters/pm/{yyyy})
const ASSET_STATUS = { 1: 'normal', 2: 'repair', 3: 'written_off', 4: 'expired' }
const ASSET_ACTION = { PM: 'pm', REPAIR: 'repair', CHANGE: 'change', TRANSFER: 'transfer', INSTALL: 'install' }
const REPEAT = { MINUTE: 'minute', HOUR: 'hour', DAY: 'day', WEEK: 'week', MONTH: 'month', QUARTER: 'quarter', YEAR: 'year' }
const num = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v))

/**
 * Assets (asset_category=assets), materials (equipt), their stock card (stocks), repair log (asset_category=repair,
 * one request per asset), check lists, asset categories and PM plans (pm_action.php). Small: hundreds of records.
 * Record ids: cpfm_as{asset_id}, cpfm_m{asset_id}, cpfm_mc_{hash(code)} (a code only seen on the stock card),
 * cpfm_sk{stk_id}, cpfm_al{asset_id}, cpfm_pm{sched_id}, cpfm_at_{code}, cpfm_cl_{code}. See CPFM_IMPORT.md.
 */
async function importInventory({ db, cur, up, set, findBy, stats, sites, locByCode, area, assetRows, assetIdByCode, jobNoById, jobTypeIdOf }) {
  const ASSETS = ONLY.has('assets')
  const PM = ONLY.has('pm')
  if (!ASSETS && !PM) return
  log('→ assets, materials, PM plans')
  mkdirSync(join(CACHE, 'inv'), { recursive: true })
  const write = (coll, id, rec, counter) => {
    const prev = cur[coll][id]
    const h = hash(JSON.stringify(rec), 16)
    if (prev?.cpfm?.hash === h && !FORCE) return false
    set(`${coll}/${id}`, { ...rec, cpfm: { ...rec.cpfm, hash: h } })
    stats[counter]++
    return true
  }

  /* where a record is: CPFM location code, else "site > area" name */
  const siteByName = {}
  for (const [code, st] of Object.entries(sites)) siteByName[norm(st.nameTh)] = code
  function place(code, full, group) {
    const hit = locByCode[clean(code)]
    if (hit) return hit
    const parts = String(full || '').split('>').map(clean).filter(Boolean)
    const siteCode = siteByName[norm(group || parts[0])]
    if (!siteCode || !parts.length) return { siteId: siteCode ? sites[siteCode].id : null, buildingId: null, areaId: null }
    const { building: bName, floor } = splitLocation(parts.at(-1))
    return { siteId: sites[siteCode].id, ...area(siteCode, bName, floor) }
  }
  const userName = (s) => clean(s).slice(0, 120)
  const stamps = (r) => {
    const createdAt = tsBkk(r.users_date) || null
    return { createdAt, updatedAt: tsBkk(r.users_update) || createdAt, createdBy: userName(r.users_date_by), updatedBy: userName(r.users_update_by || r.users_date_by) }
  }
  // a job referred to by the stock card / repair log: only link it when it exists (imported now or already in the DB)
  const jobRef = {}
  async function jobOf(taskId) {
    if (!taskId) return { jobId: null, jobNo: null }
    const id = `cpfm_${taskId}`
    if (jobNoById[taskId]) return { jobId: id, jobNo: jobNoById[taskId] }
    if (!(taskId in jobRef)) jobRef[taskId] = cur.jobs[id]?.jobNo || (db ? (await db.ref(`jobs/${id}/jobNo`).get()).val() : null)
    return jobRef[taskId] ? { jobId: id, jobNo: jobRef[taskId] } : { jobId: null, jobNo: null }
  }
  // attachment list + comment log of an asset / material / plan, cached until its users_update changes
  async function extras(rowType, rowId, stamp) {
    const f = join(CACHE, 'inv', `${rowType}-${rowId}.json`)
    if (!argv['refresh-notes'] && existsSync(f)) {
      const c = JSON.parse(readFileSync(f, 'utf8'))
      if (c.stamp === stamp) return c
    }
    const docs = FILES ? (await call(`document/document_action.php?menu=&status_type=document&row_id=${rowId}&row_type=${rowType}&category=&act=grid`, { start: 0, limit: 100 })).data || [] : []
    const notes = NOTES ? (await call('notes/note_action.php', { act: 'grid', row_type: rowType, row_id: rowId, start: 0, limit: 500 })).data || [] : []
    const c = { stamp, docs, notes }
    writeFileSync(f, JSON.stringify(c))
    return c
  }
  function putExtras(coll, id, { docs, notes }) {
    const prev = cur[coll][id] || {}
    for (const d of docs) {
      if (d.f_status === '0' || !d.f_url) continue
      const link = { name: clean(d.f_name).slice(0, 200) || `cpfm_f${d.f_id}`, url: fileUrl(d), type: String(d.f_type || '').toLowerCase(), bytes: Number(d.f_size) || 0, by: clean(d.users_date_by), at: tsBkk(d.users_date) }
      if (JSON.stringify(prev.files?.[`cpfm_f${d.f_id}`]) !== JSON.stringify(link)) up[`${coll}/${id}/files/cpfm_f${d.f_id}`] = link
    }
    for (const n of notes) {
      const line = { at: tsBkk(n.users_date) || 0, byUid: 'cpfm', byName: userName(n.users_date_by), note: clean([n.note_status, n.note_detail].filter(Boolean).join(': ')).slice(0, 3000) }
      if (JSON.stringify(prev.history?.[`cpfm_n${n.note_id}`]) !== JSON.stringify(line)) up[`${coll}/${id}/history/cpfm_n${n.note_id}`] = line
    }
  }

  /* categories (ระบบงาน → ประเภท), brands, check lists */
  const typeIds = {}
  const groups = await lookup({ type_category: 'assettype', type_parent: '0', order_by: 'type_order' })
  const types = await lookup({ type_category: 'assettype', type_parent: 'sub', order_by: 'type_order' })
  for (const [list, isGroup] of [[groups, true], [types, false]]) {
    list.forEach((t, i) => {
      const code = clean(t.type_code)
      const id = findBy('assetTypes', (v) => v.cpfm?.code === code) || `cpfm_at_${keySafe(code)}`
      typeIds[code] = id
      if (!cur.assetTypes[id]) stats.assetTypes++
      // names mix Thai and English mid-sentence ("ระบบโทรศัพท์ และระบบ Network/…"), so keep them whole
      set(`assetTypes/${id}`, { code, nameTh: clean(t.type_name) || code, nameEn: clean(t.type_name_en) || cur.assetTypes[id]?.nameEn || '', parentId: isGroup ? null : typeIds[clean(t.type_parent)] || null,
        order: Number(t.type_order) || i + 1, active: t.type_status !== '0', cpfm: { code } })
    })
  }
  const brandName = {}
  for (const b of await lookup({ type_category: 'assetbrand', order_by: 'type_code', partial: 'y' })) brandName[clean(b.type_code)] = clean(b.type_name)
  const clIds = {}
  const clItems = await lookup({ type_category: 'asset-checklist', type_parent: 'sub', partial: 'y' })
  for (const c of await lookup({ type_category: 'asset-checklist', order_by: 'type_code', partial: 'y', type_parent: '0' })) {
    const code = clean(c.type_code)
    const id = findBy('checklists', (v) => v.cpfm?.code === code) || `cpfm_cl_${keySafe(code)}`
    clIds[code] = id
    if (!cur.checklists[id]) stats.checklists++
    // items belong to the template by code, or by the name the template is called after ("ฟอร์ม Air SplitType" ↔ "Air SplitType")
    const items = {}
    for (const it of clItems.filter((x) => clean(x.type_parent) === code || norm(c.type_name).includes(norm(x.type_parent)))) {
      const [kind, options = ''] = String(it.type_name || '').split('|')
      items[keySafe(it.type_code)] = { order: Number(it.type_order) || 0, label: clean(it.type_color || it.type_name).slice(0, 300), kind: clean(kind).slice(0, 20) || 'text', options: clean(options).slice(0, 500) }
    }
    up[`checklists/${id}`] = { code, nameTh: clean(c.type_name), active: c.type_status !== '0', items, cpfm: { code } }
  }

  if (ASSETS) {
    /* เครื่องจักรและอุปกรณ์ */
    const assetIds = new Set()
    for (const r of assetRows) {
      const id = `cpfm_as${r.asset_id}`
      assetIds.add(id)
      if (!cur.assets[id]) stats.assets++
      let unit = clean(r.asset_unit)
      if (locByCode[unit] || unit === clean(r.asset_location)) unit = '' // CPFM rows often have the location code in the unit column
      const rec = {
        code: (clean(r.asset_code) || id).slice(0, 80), name: (clean(r.asset_title) || clean(r.asset_code) || id).slice(0, 200), typeId: typeIds[clean(r.asset_type)] || null,
        ...place(r.asset_location, r.assetlocation, r.assetlocationgroup), locationDetail: clean(r.asset_floor).slice(0, 200),
        status: ASSET_STATUS[r.asset_status] || 'normal', brand: (brandName[clean(r.asset_brand)] || clean(r.asset_brand)).slice(0, 120),
        model: clean(r.asset_model).slice(0, 120), serial: clean(r.asset_sn).slice(0, 120), supplier: clean(r.asset_vendor).slice(0, 120),
        qty: num(r.asset_amount), unit: unit.slice(0, 40), price: num(r.asset_price), installedAt: tsBkk(r.asset_date),
        warrantyYears: num(r.asset_warantee), lifeYears: num(r.asset_livetime), pm: r.asset_pm === 'PM', qm: r.asset_qm === 'QM',
        checklistId: clIds[clean(r.asset_checklist)] || null, detail: clean(r.asset_detail).slice(0, 3000), remark: clean(r.asset_remark).slice(0, 3000),
        ...stamps(r), cpfm: { id: r.asset_id, code: clean(r.asset_code), location: clean(r.asset_location), type: clean(r.asset_type), brand: clean(r.asset_brand) }
      }
      write('assets', id, rec, 'assetsChanged')
    }

    /* ซ่อมเครื่องจักร: repair log, one request per asset (asset_category=repair rows, row_id = the job) */
    const logIds = new Set()
    let n = 0
    await pool(assetRows, CONC, async (r) => {
      const assetId = `cpfm_as${r.asset_id}`
      const rows = await grid(`assets/assets_action.php?menu=asset-list&row_type=assets&row_id=${r.asset_id}&asset_location=&act=grid&asset_code=${encodeURIComponent(r.asset_code)}&asset_category=repair&status_type=tasks`)
      const ex = await extras('assetslist', r.asset_id, `${r.users_update || r.users_date}`)
      putExtras('assets', assetId, ex)
      for (const l of rows) {
        const id = `cpfm_al${l.asset_id}`
        logIds.add(id)
        if (!cur.assetLogs[id]) stats.assetLogs++
        const job = l.row_type === 'tasks' ? await jobOf(l.row_id) : { jobId: null, jobNo: null }
        const at = tsBkk(l.asset_date) || tsBkk(l.users_date) || 0
        write('assetLogs', id, {
          assetId, action: ASSET_ACTION[clean(l.asset_action).toUpperCase()] || 'other', at, detail: clean(l.asset_detail).slice(0, 3000),
          qty: num(l.asset_amount), unit: clean(l.asset_unit).slice(0, 40), cost: num(l.asset_price), downtime: clean(l.asset_min).slice(0, 40),
          ...job, jobNo: job.jobNo || clean(l.task_code) || null, byUid: 'cpfm', byName: userName(l.users_date_by), createdAt: tsBkk(l.users_date) || at,
          cpfm: { id: l.asset_id, task: l.row_id || null }
        }, 'assetLogsChanged')
      }
      if (++n % 100 === 0) log(`  repair logs of ${n}/${assetRows.length} assets`)
    })

    /* วัสดุอุปกรณ์ + stock card */
    const matRows = await grid(ASSET_GRID('asset-equipt', 'equipt', 'gridequipt'))
    const moveRows = await grid('stocks/stocks_action.php?menu=asset-equipt&stk_category=equipt&stk_location=&stk_code=&act=grid&status_type=stocks')
    log(`  ${assetRows.length} assets, ${logIds.size} repair log lines, ${matRows.length} materials, ${moveRows.length} stock card lines`)
    const matIdByCode = {}
    const cpfmStock = {} // material id → CPFM's own on-hand (the grid's stock column), to check our sum
    for (const r of matRows) {
      const id = `cpfm_m${r.asset_id}`
      matIdByCode[clean(r.asset_code)] = id
      cpfmStock[id] = num(r.stock) || 0
      if (!cur.materials[id]) stats.materials++
      write('materials', id, {
        code: (clean(r.asset_code) || id).slice(0, 80), name: (clean(r.asset_title) || id).slice(0, 200), typeId: typeIds[clean(r.asset_type)] || null,
        store: clean(r.asset_store).slice(0, 80), brand: (brandName[clean(r.asset_brand)] || clean(r.asset_brand)).slice(0, 120), model: clean(r.asset_model).slice(0, 120),
        serial: clean(r.asset_sn).slice(0, 120), supplier: clean(r.asset_vendor).slice(0, 120), unit: clean(r.asset_unit).slice(0, 40), price: num(r.asset_price),
        min: num(r.asset_min), max: num(r.asset_max), detail: clean(r.asset_detail).slice(0, 3000), remark: clean(r.asset_remark).slice(0, 3000), active: true,
        ...stamps(r), cpfm: { id: r.asset_id, code: clean(r.asset_code), type: clean(r.asset_type) }
      }, 'materialsChanged')
      putExtras('materials', id, await extras('equipt', r.asset_id, `${r.users_update || r.users_date}`))
    }
    // codes that are only on the stock card (items deleted in CPFM): keep their history under an inactive material
    for (const r of moveRows) {
      const code = clean(r.stk_code)
      if (matIdByCode[code]) continue
      const id = `cpfm_mc_${hash(code)}`
      matIdByCode[code] = id
      if (!cur.materials[id]) stats.materials++
      write('materials', id, { code: (code || id).slice(0, 80), name: (clean(r.stk_asset) || code || id).slice(0, 200), unit: clean(r.stk_unit).slice(0, 40), price: num(r.stk_price),
        store: clean(r.stk_store).slice(0, 80), active: false, cpfm: { code, stockCardOnly: true } }, 'materialsChanged')
    }
    const moveIds = new Set()
    const sums = {}
    for (const r of moveRows) {
      const id = `cpfm_sk${r.stk_id}`
      moveIds.add(id)
      const materialId = matIdByCode[clean(r.stk_code)]
      const type = r.stk_type === 'in' ? 'in' : 'out'
      const qty = Math.abs(num(r.stock) ?? num(r.stk_amount) ?? 0)
      const delta = type === 'in' ? qty : -qty
      if (num(r.stock) !== null && num(r.stock) !== delta) log(`  ⚠ stock line ${r.stk_id}: ${r.stk_type} with stock ${r.stock}`)
      sums[materialId] = (sums[materialId] || 0) + delta
      if (!qty) continue // the rules need qty > 0; a 0 line changes nothing
      if (!cur.stockMoves[id]) stats.stockMoves++
      const job = r.row_type === 'tasks' ? await jobOf(r.row_id) : { jobId: null, jobNo: null }
      const at = tsBkk(r.stk_date) || tsBkk(r.users_date) || 0
      write('stockMoves', id, {
        materialId, code: clean(r.stk_code).slice(0, 80), name: clean(r.stk_asset).slice(0, 200), type, qty, delta, unit: clean(r.stk_unit).slice(0, 40),
        price: num(r.stk_price), total: num(r.stk_total), store: clean(r.stk_store).slice(0, 80), title: clean(r.stk_title).slice(0, 200),
        detail: clean([r.stk_detail, r.stk_remark].filter((x) => clean(x)).join('\n')).slice(0, 1000),
        ...place(r.stk_location, r.location ? `${r.locationgroup || ''} > ${r.location}` : '', r.locationgroup), ...job,
        at, byUid: 'cpfm', byName: userName(r.users_date_by), createdAt: tsBkk(r.users_date) || at, cpfm: { id: r.stk_id, task: r.row_id || null }
      }, 'stockMovesChanged')
    }
    // on-hand = CPFM's lines + lines entered in the new app
    for (const [id, m] of Object.entries(cur.stockMoves)) if (m && !m.cpfm && m.materialId) sums[m.materialId] = (sums[m.materialId] || 0) + (Number(m.delta) || 0)
    for (const id of new Set([...Object.values(matIdByCode), ...Object.keys(sums)])) {
      const v = sums[id] || 0
      if (cur.materials[id]?.onHand !== v) up[`materials/${id}/onHand`] = v
    }
    const off = Object.entries(cpfmStock).filter(([id, v]) => {
      const appOnly = Object.values(cur.stockMoves).filter((m) => m && !m.cpfm && m.materialId === id).reduce((a, m) => a + (Number(m.delta) || 0), 0)
      return (sums[id] || 0) - appOnly !== v
    })
    if (off.length) log(`  ⚠ ${off.length} materials: the stock card does not add up to CPFM's on-hand (${off.slice(0, 5).map(([id]) => id).join(', ')})`)
    // lines deleted in CPFM disappear here too, so on-hand keeps matching
    if (!SITES_WANTED) {
      for (const [coll, seen] of [['stockMoves', moveIds], ['assetLogs', logIds]]) {
        for (const id of Object.keys(cur[coll])) if (id.startsWith('cpfm_') && !seen.has(id)) { up[`${coll}/${id}`] = null; stats.removed++ }
      }
    }
  }

  if (PM) {
    /* แผนบำรุงรักษา: the repeat rule, its machines, and the work orders CPFM made for it */
    const plans = await grid('pm/pm_action.php?menu=pm-list&row_type=PM&authen_location=y&act=grid&status_type=preventive&mode=')
    const knownAsset = (aid) => cur.assets[aid] || assetRows.some((r) => `cpfm_as${r.asset_id}` === aid)
    for (const r of plans) {
      const id = `cpfm_pm${r.sched_id}`
      if (!cur.pmPlans[id]) stats.pmPlans++
      const y = clean(r.sched_code).match(/^PM(\d{4})-(\d+)$/)
      if (y) pmCounters[y[1]] = Math.max(pmCounters[y[1]] || 0, Number(y[2]))
      const assets = {}
      for (const a of (await call('assets/assets_action.php?act=listassetspm&asset_pm=PM', { sched_id: r.sched_id })).data || []) {
        const aid = `cpfm_as${a.asset_id}`
        if (knownAsset(aid)) assets[aid] = true
      }
      const rec = {
        code: clean(r.sched_code), title: (clean(r.sched_title) || clean(r.sched_code)).slice(0, 200), detail: clean(r.sched_detail).slice(0, 3000),
        ...place(r.sched_location, r.schedulelocation ? `${r.locationgroup || ''} > ${r.schedulelocation}` : '', r.locationgroup),
        jobTypeId: jobTypeIdOf(clean(r.sched_tasktype) || 'PM'), priority: PRIORITY[r.sched_priority] || 'normal',
        start: tsBkk(r.sched_start), end: tsBkk(r.sched_end), repeat: REPEAT[clean(r.sched_repeat).toUpperCase()] || 'none',
        every: Math.max(1, num(r.sched_freq_value) || 1), lastAt: tsBkk(r.sched_last),
        remind: num(r.sched_remind_value) ? { n: num(r.sched_remind_value), unit: REPEAT[clean(r.sched_remind).toUpperCase()] || 'day' } : null,
        active: r.sched_status === '1', checklistId: clIds[clean(r.sched_template)] || null, assets: Object.keys(assets).length ? assets : null,
        ...stamps(r), cpfm: { id: r.sched_id, location: clean(r.sched_location), asset: clean(r.sched_asset) }
      }
      write('pmPlans', id, rec, 'pmPlansChanged')
      putExtras('pmPlans', id, await extras('pm', r.sched_id, `${r.users_update || r.users_date}`))
      // CPFM's own calendar (แผนตามปฏิทิน): check our repeat rule gives the same dates, and pick up the work orders it made
      const sched = (await call(`pm/pm_action.php?menu=pm-list&row_type=pm&row_id=${r.sched_id}&act=gridschedule`, { start: 0, limit: 1000 })).data || []
      const theirs = sched.flatMap((x) => String(x.sch_date || '').split(',')).map(tsBkk).filter(Boolean)
      const ours = rec.start ? occurrences(rec, 0, rec.end || Math.max(...theirs, rec.start), 5000) : []
      const missing = theirs.filter((t) => !ours.includes(t)).length
      if (missing) log(`  ⚠ ${rec.code}: ${missing} of CPFM's ${theirs.length} planned dates don't follow its repeat rule (${rec.repeat} × ${rec.every}); we use the rule`)
      for (const x of sched.filter((x) => clean(x.task_code))) {
        const j = db && (await db.ref('jobs').orderByChild('jobNo').equalTo(clean(x.task_code)).get()).val()
        const jobId = j && Object.keys(j)[0]
        const at = tsBkk(String(x.sch_date || '').split(',')[0])
        if (jobId && at && cur.pmPlans[id]?.jobs?.[at] !== jobId) up[`pmPlans/${id}/jobs/${at}`] = jobId
      }
    }
    log(`  ${plans.length} PM plans`)
  }
}

/* ================================================================= */
async function main() {
  for (const d of ['notes', 'docs', 'photos']) mkdirSync(join(CACHE, d), { recursive: true })
  log(`→ CPFM ${BASE} as ${USER}${DRY ? '  (dry run)' : ''}`)
  await login()

  const db = await openDb()
  log('→ reading current Firebase data')
  const cur = {}
  for (const k of ['sites', 'buildings', 'areas', 'jobTypes', 'staff', 'users', ...(JOBS ? ['jobs'] : []),
    'assetTypes', 'checklists', 'assets', 'assetLogs', 'materials', 'stockMoves', 'pmPlans']) cur[k] = await readAll(db, k)
  cur.jobs ||= {}
  let bucket = null
  if (JOBS && FILES && PHOTOS === 'storage' && !DRY) {
    const { getStorage } = await import('firebase-admin/storage')
    bucket = getStorage(fbApp).bucket()
    const [ok] = await bucket.exists().catch((e) => die(`Storage: ${e.message}`))
    if (!ok) die(`Storage bucket ${bucket.name} does not exist — enable Storage (Blaze plan) or run with --photos=link (or rtdb)`)
  }
  const photoJobs = [] // { jobId, pid, f, at } — downloaded + stored after the scrape

  const up = {} // one big multi-path update, flushed in chunks
  const stats = { sites: 0, buildings: 0, areas: 0, jobTypes: 0, staff: 0, jobsNew: 0, jobsChanged: 0, jobsSame: 0, events: 0, notesFetched: 0, docsFetched: 0, photos: 0, fileLinks: 0, photoErrors: 0, reindexed: 0,
    assetTypes: 0, checklists: 0, assets: 0, assetsChanged: 0, assetLogs: 0, assetLogsChanged: 0, materials: 0, materialsChanged: 0, stockMoves: 0, stockMovesChanged: 0, pmPlans: 0, pmPlansChanged: 0, removed: 0 }
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

  /* ---------- ผู้ปฏิบัติงาน: CPFM staff → /staff records, linked to an account later (Users page / sign-in e-mail) ---------- */
  const staffIds = {} // CPFM staff code → staff id
  function staffMember(code, name, active, siteCode = '') {
    code = String(code || '').trim()
    if (!code) return null
    if (staffIds[code]) return staffIds[code]
    const id = findBy('staff', (v) => v.cpfm?.code === code) || `cpfm_s${keySafe(code)}`
    staffIds[code] = id
    const prev = cur.staff[id] || {}
    // uid / email / company are set in the app and left alone
    set(`staff/${id}`, { name: (clean(name) || prev.name || code).slice(0, 120), code, role: prev.role || 'technician', active, siteId: sites[siteCode]?.id || prev.siteId || null, cpfm: { code } })
    if (!cur.staff[id]) stats.staff++
    return id
  }
  for (const m of await lookup({ type_category: 'taskstaffen', order_by: 'type_code', authen_comment: 'y' })) {
    staffMember(m.type_code, m.type_name, m.type_status === '1', clean(m.type_comment))
  }

  /* ---------- users by e-mail (so people see their old jobs under "My jobs") ---------- */
  const uidByEmail = {}
  for (const [uid, u] of Object.entries(cur.users)) if (u?.email) uidByEmail[emailKey(u.email)] = uid
  const ownJobNos = new Set(Object.values(cur.jobs).filter((j) => j && !j.cpfm).map((j) => j.jobNo))

  /* ---------- machine codes (jobs can name one in task_asset) ---------- */
  const assetRows = JOBS || ONLY.has('assets') || ONLY.has('pm') ? await grid(ASSET_GRID('asset-list', 'assets', 'gridassets')) : []
  const assetIdByCode = {}
  for (const [id, a] of Object.entries(cur.assets)) if (a && !a.cpfm && a.code) assetIdByCode[a.code] = id
  for (const r of assetRows) assetIdByCode[clean(r.asset_code)] ||= `cpfm_as${r.asset_id}`

  /* ---------- jobs ---------- */
  const counters = {}
  const conflicts = []
  const jobNoById = {} // CPFM task_id → task_code, for the stock card / repair log
  for (const [siteCode, site] of Object.entries(JOBS ? sites : {})) {
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
      jobNoById[r.task_id] = jobNo
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
      // ผู้ปฏิบัติงาน: task_action_by = staff codes, actionby = the same people's names (both comma separated).
      // A code missing from the staff list becomes an inactive /staff record.
      const names = String(r.actionby || '').split(',')
      const assignees = {}
      String(r.task_action_by || '').split(',').forEach((c, i) => {
        const sid = staffMember(c, names[i], false)
        if (sid) assignees[sid] = (clean(names[i]) || cur.staff[sid]?.name || String(c).trim()).slice(0, 120)
      })
      const job = {
        jobNo, status, priority: PRIORITY[r.task_priority] || 'normal',
        siteId: where.siteId, buildingId: where.buildingId, areaId: where.areaId,
        jobTypeId: jobType(r.task_type || 'OT', r.typename || r.task_title, false),
        locationDetail: '', description: clean(r.task_detail).slice(0, 3000) || clean(r.task_title) || '-',
        reporterUid: uidByEmail[emailKey(email)] || 'cpfm',
        reporter: { name: clean(r.task_by).slice(0, 120), email: email.slice(0, 160), phone: clean(r.task_by_tel).slice(0, 40), department: clean(r.task_by_dept).slice(0, 120) },
        lang: 'th', pdpaAt: createdAt,
        assignees: Object.keys(assignees).length ? assignees : null, assigneeKeys: assigneeKeyString(assignees),
        assigneeName: Object.values(assignees).join(', ').slice(0, 300) || null,
        assigneeUid: null, trackingCode: null, // pre-2026-11-02 fields (one assignee; random tracking code)
        expectedDate: tsBkk(r.duedate), expectedNote: '',
        hold, workDetail: clean(r.task_action).slice(0, 3000),
        createdAt, updatedAt,
        completedAt: status === 'completed' ? tsBkk(r.donetime) || tsBkk(r.task_status_date) || updatedAt : null,
        cpfm: { id: r.task_id, location: (r.task_location || '').trim(), type: r.task_type || '', by: clean(r.users_date_by), rating: r.rate_star ? { star: Number(r.rate_star), comment: clean(r.rate_comment) } : null }
      }
      const aid = assetIdByCode[clean(r.task_asset)]
      if (r.task_asset && aid) job.assetId = aid // only when set, so the hash of every other job stays the same
      job.idx = jobIndex(job)

      /* attachments: photos → our photo store (later, in parallel); everything else → a link to the old server */
      for (const f of docs[r.task_id] || []) {
        if (f.f_status === '0' || !f.f_url) continue
        const pid = `cpfm_f${f.f_id}`
        const at = tsBkk(f.users_date) || createdAt
        if (PHOTOS !== 'link' && IMG.test(f.f_type || '') && (f.users_date || '') >= PHOTOS_SINCE) {
          if (!prev?.photos?.[pid]) photoJobs.push({ jobId: id, pid, f, at, linked: !!prev?.files?.[pid] })
          else if (prev?.files?.[pid]) up[`jobs/${id}/files/${pid}`] = null
          continue
        }
        const link = { name: clean(f.f_name).slice(0, 200) || pid, url: fileUrl(f), type: String(f.f_type || '').toLowerCase(), bytes: Number(f.f_size) || 0, by: clean(f.users_date_by), at }
        if (JSON.stringify(prev?.files?.[pid]) !== JSON.stringify(link)) { up[`jobs/${id}/files/${pid}`] = link; stats.fileLinks++ }
      }

      const h = hash(JSON.stringify([job, evs]), 16)
      if (prev && prev.cpfm?.hash === h && !FORCE && !prev.trackingCode) { stats.jobsSame++; continue }
      job.cpfm.hash = h
      prev ? stats.jobsChanged++ : stats.jobsNew++

      set(`jobs/${id}`, job)
      for (const k of Object.keys(prev?.assignees || {})) if (!assignees[k]) up[`assignments/${k}/${id}`] = null
      for (const k of Object.keys(assignees)) up[`assignments/${k}/${id}`] = true
      // the public tracking page is keyed by job number; before 2026-11-02 it was a random code
      if (prev?.trackingCode) up[`tracking/${prev.trackingCode}`] = null
      const owner = !ownJobNos.has(jobNo) // an app job already has this number → it keeps the tracking page
      for (const [eid, ev] of Object.entries(evs)) {
        up[`jobEvents/${id}/${eid}`] = ev
        if (ev.public && owner) up[`tracking/${jobNo}/timeline/${eid}`] = { at: ev.at, type: ev.type, to: ev.to, note: ev.type === 'created' ? '' : ev.note }
        stats.events++
      }
      if (owner) set(`tracking/${jobNo}`, {
        jobId: id, jobNo, status, siteId: job.siteId, jobTypeId: job.jobTypeId, buildingId: job.buildingId, areaId: job.areaId,
        createdAt, updatedAt, expectedDate: job.expectedDate, expectedNote: '', hold: hold && { ...hold }
      })
    }
  }

  /* ---------- เครื่องจักรและอุปกรณ์, วัสดุอุปกรณ์, PM ---------- */
  const jobTypeIdOf = (code) => typeIds[code] || findBy('jobTypes', (v) => v.cpfm?.code === code) ||
    (TYPE_ALIAS[code] && findBy('jobTypes', (v) => v.nameEn === TYPE_ALIAS[code])) || null
  await importInventory({ db, cur, up, set, findBy, stats, sites, locByCode, area, assetRows, assetIdByCode, jobNoById, jobTypeIdOf })

  /* ---------- jobs created in the new app: sort keys (paged job list) + pre-2026-11-02 fields ---------- */
  for (const [id, j] of Object.entries(cur.jobs)) {
    if (!j || j.cpfm || typeof j.createdAt !== 'number') continue
    if (j.trackingCode && db) { // random tracking code → tracking/{jobNo}
      const t = (await db.ref(`tracking/${j.trackingCode}`).get()).val()
      if (t) up[`tracking/${j.jobNo}`] = t
      up[`tracking/${j.trackingCode}`] = null; up[`jobs/${id}/trackingCode`] = null
    }
    if (j.assigneeUid) { // one assignee → assignees map
      const a = { [j.assigneeUid]: (j.assigneeName || '-').slice(0, 120) }
      Object.assign(up, { [`jobs/${id}/assignees`]: a, [`jobs/${id}/assigneeKeys`]: assigneeKeyString(a), [`jobs/${id}/assigneeUid`]: null, [`assignments/${j.assigneeUid}/${id}`]: true })
    }
    const idx = jobIndex(j)
    if (JSON.stringify(idx) !== JSON.stringify(j.idx)) { up[`jobs/${id}/idx`] = idx; stats.reindexed++ }
  }

  /* ---------- what this run would cost (Blaze plan) — stop here unless --yes ---------- */
  const est = estimate(up, photoJobs)
  log('\nUpload estimate:\n' + est.text)
  writeFileSync(join(CACHE, 'estimate.json'), JSON.stringify({ at: new Date().toISOString(), stats, ...est.numbers }, null, 2))
  if (!DRY && !argv.yes) {
    log('\n⏸ nothing uploaded. Check the estimate above, then re-run with --yes (the cache makes it quick).')
    process.exit(0)
  }
  if (!DRY && est.numbers.overFreeTier.length && !argv['accept-cost']) {
    log('\n⏸ nothing uploaded: over the free tier. Ask the project owner, then add --accept-cost (or use --photos-since to split it).')
    process.exit(0)
  }

  /* ---------- photos: download once (cached), shrink, store ---------- */
  if (photoJobs.length && DRY) log(`dry run: ${photoJobs.length} photos would be downloaded and stored (${PHOTOS})`)
  if (photoJobs.length && !DRY) {
    log(`→ ${photoJobs.length} photos → ${PHOTOS}`)
    let done = 0
    await pool(photoJobs, CONC, async ({ jobId, pid, f, at, linked }) => {
      try {
        const img = await webpOf(f)
        const meta = { w: img.w, h: img.h, bytes: img.bytes, by: 'cpfm', at, name: clean(f.f_name).slice(0, 200) }
        if (PHOTOS === 'rtdb') {
          up[`jobPhotos/${jobId}/${pid}`] = 'data:image/webp;base64,' + img.buf.toString('base64')
          up[`jobs/${jobId}/photos/${pid}`] = { ...meta, store: 'rtdb' }
        } else {
          const path = `jobs/${jobId}/${pid}.webp`
          const token = createHash('sha1').update(path + Date.now()).digest('hex')
          await bucket.file(path).save(img.buf, { resumable: false, contentType: 'image/webp', metadata: { cacheControl: 'public,max-age=31536000', metadata: { uid: 'cpfm', firebaseStorageDownloadTokens: token } } })
          const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`
          up[`jobs/${jobId}/photos/${pid}`] = { ...meta, store: 'storage', path, url }
        }
        if (linked) up[`jobs/${jobId}/files/${pid}`] = null // stored now (e.g. a later --photos-since run) — drop the old link
        stats.photos++
      } catch (e) {
        // HEIC the converter can't read, a broken file, a 404 … keep a link instead
        stats.photoErrors++
        up[`jobs/${jobId}/files/${pid}`] = { name: clean(f.f_name).slice(0, 200) || pid, url: fileUrl(f), type: String(f.f_type || '').toLowerCase(), bytes: Number(f.f_size) || 0, by: clean(f.users_date_by), at }
      }
      if (++done % 200 === 0) log(`  photos ${done}/${photoJobs.length}`)
    })
  }

  /* ---------- write ---------- */
  log('\nSummary (new records):', JSON.stringify(stats))
  if (conflicts.length) log(`⚠ ${conflicts.length} job numbers exist both in CPFM and as jobs created in the new app (kept both; the app job keeps the tracking page): ${conflicts.slice(0, 10).join(', ')}…`)
  const paths = Object.keys(up)
  if (DRY) {
    const out = join(CACHE, 'dry-run.json')
    writeFileSync(out, JSON.stringify(up))
    log(`dry run: ${paths.length} paths written to ${out} — nothing sent to Firebase`)
    process.exit(0) // an open Firebase connection would keep node alive
  }
  const CHUNK = 5000
  for (let i = 0; i < paths.length; i += CHUNK) {
    const part = {}
    for (const p of paths.slice(i, i + CHUNK)) part[p] = up[p]
    await db.ref().update(part)
    log(`  wrote ${Math.min(i + CHUNK, paths.length)}/${paths.length} paths`)
  }
  // counters/jobs/WO{yyyy} = highest CPFM number, so the app continues after it once /config/public/jobPrefix is "WO"
  for (const [year, n] of Object.entries(counters)) {
    await db.ref(`counters/jobs/WO${year}`).transaction((v) => Math.max(v || 0, n))
    await db.ref(`counters/jobs/${year}`).remove() // pre-2026-11-02 key
  }
  for (const [year, n] of Object.entries(pmCounters)) await db.ref(`counters/pm/${year}`).transaction((v) => Math.max(v || 0, n))
  // a full run replaces /config/cpfmImport; a partial one (--only) only its own entry under sections/
  const run = { at: Date.now(), only: [...ONLY].join(','), stats }
  if (ONLY.size === 3) await db.ref('config/cpfmImport').set(run)
  else await db.ref(`config/cpfmImport/sections/${[...ONLY].sort().join('_')}`).set(run)
  log('✔ done')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
