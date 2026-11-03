import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import fs from 'fs'
const env = await initializeTestEnvironment({
  projectId: 'vistec-repair',
  database: { rules: fs.readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9000 }
})
const TS = { '.sv': 'timestamp' }
await env.withSecurityRulesDisabled(async (ctx) => {
  await ctx.database().ref().set({
    users: { admin: { role: 'admin', email: 'a@x' }, tech: { role: 'technician', email: 't@x' }, c1: { role: 'contractor', email: 'c@x' }, u1: { role: 'user' }, u2: { role: 'user' } },
    sites: { s1: { nameTh: 'VISTEC' } }, buildings: { b1: { nameTh: 'อาคาร', siteId: 's1' } }, jobTypes: { t1: { nameTh: 'ไฟฟ้า' } },
    invites: { 'new,guy@corp,com': { email: 'new.guy@corp.com', role: 'contractor' } },
    staff: { cpfm_s1: { name: 'ช่าง ก', role: 'technician', email: 'tech.a@vistec.ac.th' }, cpfm_s2: { name: 'ช่าง ข', role: 'technician' } }
  })
})
let pass = 0, fail = 0
async function t(name, p) { try { await p; pass++; console.log('ok  ', name) } catch (e) { fail++; console.log('FAIL', name, e.message?.slice(0, 200)) } }
const db = (uid, tok = {}) => (uid ? env.authenticatedContext(uid, tok) : env.unauthenticatedContext()).database()

// profiles
await t('new user creates profile as user', assertSucceeds(db('u3').ref('users/u3').update({ email: 'x@y', role: 'user', providers: { microsoft_com: true }, createdAt: TS, lastLoginAt: TS, lang: 'th' })))
await t('new user cannot self-admin', assertFails(db('u5').ref('users/u5').update({ role: 'admin' })))
await t('user cannot escalate', assertFails(db('u1').ref('users/u1/role').set('technician')))
await t('unknown field rejected', assertFails(db('u1').ref('users/u1').update({ hacker: true })))
await db('u4', { email: 'New.Guy@corp.com', email_verified: true }).ref('users/u4').update({ role: 'user', email: 'new.guy@corp.com' })
await t('invite read by invitee', assertSucceeds(db('u4', { email: 'New.Guy@corp.com', email_verified: true }).ref('invites/new,guy@corp,com').once('value')))
await t('invite upgrade verified', assertSucceeds(db('u4', { email: 'New.Guy@corp.com', email_verified: true }).ref('users/u4').update({ role: 'contractor' })))
await db('u6', { email: 'new.guy@corp.com', email_verified: false }).ref('users/u6').update({ role: 'user' })
await t('invite upgrade unverified fails', assertFails(db('u6', { email: 'new.guy@corp.com', email_verified: false }).ref('users/u6').update({ role: 'contractor' })))
await t('admin sets role', assertSucceeds(db('admin').ref('users/u2/role').set('user')))
await t('user cannot list users', assertFails(db('u1').ref('users').once('value')))
await t('tech can query users by role', assertSucceeds(db('tech').ref('users').orderByChild('role').equalTo('contractor').once('value')))

// create job as u1
const r = db('u1')
await t('counter +1', assertSucceeds(r.ref('counters/jobs/VR2026').transaction((v) => (v || 0) + 1)))
await t('counter jump fails', assertFails(r.ref('counters/jobs/VR2026').set(99)))
await t('counter key must be prefix+year', assertFails(r.ref('counters/jobs/2026').set(1)))
const job = { jobNo: 'VR2026-0001', status: 'new', priority: 'normal', jobTypeId: 't1', buildingId: 'b1', locationDetail: '', gps: { lat: 12.1, lng: 101.2, accuracy: 10, at: 1 }, description: 'แอร์เสีย', reporterUid: 'u1', reporter: { name: 'A', email: 'a@b.c', phone: '08', department: '' }, lang: 'th', pdpaAt: TS, createdAt: TS, updatedAt: TS }
const create = (who, j, code = j.jobNo, id = 'j1') => db(who).ref().update({
  [`jobs/${id}`]: j,
  [`tracking/${code}`]: { jobId: id, jobNo: j.jobNo, status: 'new', jobTypeId: 't1', buildingId: 'b1', createdAt: TS, updatedAt: TS, timeline: { e1: { at: TS, type: 'created', to: 'new', note: '' } } },
  [`jobEvents/${id}/e1`]: { at: TS, byUid: who, byName: 'A', type: 'created', to: 'new', note: '', public: true }
})
await t('u2 cannot create job for u1', assertFails(create('u2', { ...job, jobNo: 'VR2026-0901' }, undefined, 'jx')))
await t('reporter cannot pre-assign', assertFails(create('u1', { ...job, jobNo: 'VR2026-0902', assignees: { c1: 'C' }, assigneeKeys: ',c1,' }, undefined, 'jy')))
await t('reporter bad siteId rejected', assertFails(create('u1', { ...job, jobNo: 'VR2026-0903', siteId: 'nope' }, undefined, 'jz')))
await t('reporter cannot use CPFM prefix', assertFails(create('u1', { ...job, jobNo: 'WO2026-0904' }, undefined, 'jw')))
await t('tracking key must be the job number', assertFails(create('u1', { ...job, jobNo: 'VR2026-0905' }, 'VR2026-0906', 'jv')))
await t('reporter creates job', assertSucceeds(create('u1', { ...job, siteId: 's1' })))
await t('number of another job cannot be reused', assertFails(create('u2', { ...job, reporterUid: 'u2', siteId: 's1' }, undefined, 'j2')))
await t('anyone reads tracking by job number', assertSucceeds(db(null).ref('tracking/VR2026-0001').once('value')))
await t('cannot list tracking', assertFails(db(null).ref('tracking').once('value')))
await t('other user cannot read job', assertFails(db('u2').ref('jobs/j1').once('value')))
await t('reporter reads own job', assertSucceeds(r.ref('jobs/j1').once('value')))
await t('reporter queries own jobs', assertSucceeds(r.ref('jobs').orderByChild('reporterUid').equalTo('u1').once('value')))
await t('reporter cannot list all jobs', assertFails(r.ref('jobs').once('value')))
await t('reporter cannot read events', assertFails(r.ref('jobEvents/j1').once('value')))
await t('reporter adds photo meta', assertSucceeds(r.ref('jobs/j1/photos/p1').set({ store: 'storage', w: 1280, h: 720, bytes: 90000, path: 'jobs/j1/p1.webp', url: 'https://x', by: 'u1', at: 1 })))
await t('reporter photo too big rejected', assertFails(r.ref('jobs/j1/photos/p2').set({ store: 'storage', w: 4000, h: 3000, bytes: 90000 })))
await t('reporter comments', assertSucceeds(r.ref().update({
  'jobs/j1/updatedAt': TS, 'tracking/VR2026-0001/updatedAt': TS,
  'jobEvents/j1/e2': { at: TS, byUid: 'u1', byName: 'A', type: 'comment', note: 'hi', public: true, from: null, to: null },
  'tracking/VR2026-0001/timeline/e2': { at: TS, type: 'comment', to: null, note: 'hi' }
})))
await t('reporter cannot change status', assertFails(r.ref().update({ 'jobs/j1/status': 'completed', 'tracking/VR2026-0001/status': 'completed' })))
await t('reporter cannot fake status event', assertFails(r.ref('jobEvents/j1/e3').set({ at: TS, byUid: 'u1', type: 'status', to: 'completed', public: true })))

// staff
const tech = db('tech')
await t('tech lists jobs', assertSucceeds(tech.ref('jobs').orderByChild('createdAt').limitToLast(100).once('value')))
await t('tech assigns to contractor', assertSucceeds(tech.ref().update({
  'jobs/j1/assignees/c1': 'C', 'jobs/j1/assigneeKeys': ',c1,', 'jobs/j1/assigneeName': 'C', 'assignments/c1/j1': true,
  'jobs/j1/status': 'assigned', 'jobs/j1/updatedAt': TS,
  'tracking/VR2026-0001/status': 'assigned', 'tracking/VR2026-0001/updatedAt': TS,
  'jobEvents/j1/e4': { at: TS, byUid: 'tech', byName: 'T', type: 'assign', to: 'C', note: '', public: true },
  'tracking/VR2026-0001/timeline/e4': { at: TS, type: 'assign', to: 'C', note: '' }
})))
await t('tech cannot change jobNo', assertFails(tech.ref('jobs/j1/jobNo').set('VR2026-0002')))
await t('bad assignee keys rejected', assertFails(tech.ref('jobs/j1/assigneeKeys').set('c1')))
await t('user cannot write assignments', assertFails(r.ref('assignments/u1/j1').set(true)))
await t('tech cannot delete job', assertFails(tech.ref('jobs/j1').remove()))
const c = db('c1')
await t('contractor reads own assignments', assertSucceeds(c.ref('assignments/c1').once('value')))
await t('contractor cannot read others assignments', assertFails(c.ref('assignments/tech').once('value')))
await t('contractor reads assigned job', assertSucceeds(c.ref('jobs/j1').once('value')))
await t('contractor reads events of assigned job', assertSucceeds(c.ref('jobEvents/j1').once('value')))
await t('contractor cannot list all', assertFails(c.ref('jobs').once('value')))
await t('contractor puts on hold', assertSucceeds(c.ref().update({
  'jobs/j1/status': 'on_hold', 'jobs/j1/hold': { reason: 'waiting_parts', note: 'รออะไหล่', partsEta: 1800000000000, resumeDate: null, since: 1 }, 'jobs/j1/expectedDate': 1800000000000, 'jobs/j1/updatedAt': TS,
  'tracking/VR2026-0001/status': 'on_hold', 'tracking/VR2026-0001/hold': { reason: 'waiting_parts', note: 'รออะไหล่', partsEta: 1800000000000 }, 'tracking/VR2026-0001/expectedDate': 1800000000000, 'tracking/VR2026-0001/updatedAt': TS,
  'jobEvents/j1/e5': { at: TS, byUid: 'c1', byName: 'C', type: 'hold', to: 'waiting_parts', note: '', public: true },
  'tracking/VR2026-0001/timeline/e5': { at: TS, type: 'hold', to: 'waiting_parts', note: '' }
})))
await t('contractor cannot change assignees', assertFails(c.ref('jobs/j1/assigneeKeys').set(',c1,c2,')))
await t('contractor cannot add self to other job', assertFails(c.ref().update({ 'jobs/cpfm_1/assigneeKeys': ',c1,' })))
await t('bad status rejected', assertFails(tech.ref('jobs/j1/status').set('done')))
await t('unauth cannot write master', assertFails(db('u1').ref('buildings/b2').set({ nameTh: 'x' })))
await t('admin writes master', assertSucceeds(db('admin').ref('buildings/b2').set({ nameTh: 'x', active: true })))
await t('public reads master', assertSucceeds(db(null).ref('jobTypes').once('value')))

// sites + jobs imported from CPFM (written by the admin SDK, then worked on in the app)
await t('public reads sites', assertSucceeds(db(null).ref('sites').once('value')))
await t('tech cannot write sites', assertFails(tech.ref('sites/s2').set({ nameTh: 'x' })))
await t('admin writes sites', assertSucceeds(db('admin').ref('sites/s2').set({ nameTh: 'KVIS', code: 'KVIS', active: true })))
await t('client cannot write cpfm ref', assertFails(tech.ref('jobs/j1/cpfm').set({ id: '1' })))
await t('client cannot mark event imported', assertFails(tech.ref('jobEvents/j1/e9').set({ at: TS, byUid: 'tech', type: 'comment', note: '', public: false, imported: true })))
await env.withSecurityRulesDisabled((ctx) => ctx.database().ref().update({
  'jobs/cpfm_1': { ...job, jobNo: 'WO2021-0001', siteId: 's1', reporterUid: 'cpfm', status: 'in_progress', createdAt: 1, updatedAt: 1, pdpaAt: 1, cpfm: { id: '1', hash: 'x' } },
  'tracking/WO2021-0001': { jobId: 'cpfm_1', jobNo: 'WO2021-0001', status: 'in_progress' }
}))
await t('tech closes imported job', assertSucceeds(tech.ref().update({
  'jobs/cpfm_1/status': 'completed', 'jobs/cpfm_1/updatedAt': TS, 'tracking/WO2021-0001/status': 'completed',
  'jobEvents/cpfm_1/e1': { at: TS, byUid: 'tech', byName: 'T', type: 'status', from: 'in_progress', to: 'completed', note: '', public: true }
})))

// paged job list (src/services/jobIndex.js)
await t('tech pages by sort key', assertSucceeds(tech.ref('jobs').orderByChild('idx/sis').startAt('s1|').endAt('s1|\uf8ff').limitToLast(51).once('value')))
await t('tech finds by jobNo', assertSucceeds(tech.ref('jobs').orderByChild('jobNo').equalTo('VR2026-0001').once('value')))
await t('user cannot page all jobs', assertFails(r.ref('jobs').orderByChild('idx/s').limitToLast(5).once('value')))
await t('tech writes sort keys', assertSucceeds(tech.ref('jobs/j1/idx').set({ s: 'on_hold|0000000000000001', o: '1|0000000000000001' })))
await t('unknown sort key rejected', assertFails(tech.ref('jobs/j1/idx/zz').set('x')))
await t('client cannot write file links', assertFails(tech.ref('jobs/j1/files/f1').set({ name: 'a', url: 'https://x' })))
// staff placeholders (CPFM technicians) linked to an account by verified e-mail
await env.withSecurityRulesDisabled((ctx) => ctx.database().ref().update({
  'jobs/cpfm_1/assignees': { cpfm_s1: 'ช่าง ก' }, 'jobs/cpfm_1/assigneeKeys': ',cpfm_s1,', 'assignments/cpfm_s1/cpfm_1': true,
  'users/c9': { role: 'contractor', email: 'tech.a@vistec.ac.th' }, 'users/c8': { role: 'contractor', email: 'x@y.z' }
}))
const ta = (ok = true) => db('c9', { email: 'Tech.A@vistec.ac.th', email_verified: ok })
await t('tech lists staff', assertSucceeds(tech.ref('staff').once('value')))
await t('user cannot list staff', assertFails(r.ref('staff').once('value')))
await t('user finds own staff record by e-mail', assertSucceeds(ta().ref('staff').orderByChild('email').equalTo('tech.a@vistec.ac.th').once('value')))
await t('cannot read placeholder jobs before linking', assertFails(ta().ref('jobs/cpfm_1').once('value')))
await t('link needs verified e-mail', assertFails(ta(false).ref().update({ 'staff/cpfm_s1/uid': 'c9', 'users/c9/staffId': 'cpfm_s1' })))
await t('other person cannot claim staff record', assertFails(db('c8', { email: 'x@y.z', email_verified: true }).ref().update({ 'staff/cpfm_s1/uid': 'c8', 'users/c8/staffId': 'cpfm_s1' })))
await t('cannot claim record without e-mail', assertFails(ta().ref().update({ 'staff/cpfm_s2/uid': 'c9', 'users/c9/staffId': 'cpfm_s2' })))
await t('cannot point profile at unlinked record', assertFails(ta().ref('users/c9/staffId').set('cpfm_s2')))
await t('person links own staff record', assertSucceeds(ta().ref().update({ 'staff/cpfm_s1/uid': 'c9', 'users/c9/staffId': 'cpfm_s1' })))
await t('linked person reads placeholder assignments', assertSucceeds(ta().ref('assignments/cpfm_s1').once('value')))
await t('linked person reads assigned job', assertSucceeds(ta().ref('jobs/cpfm_1').once('value')))
await t('cannot relink to another record', assertFails(ta().ref('users/c9/staffId').set('cpfm_s2')))
await t('tech cannot write staff', assertFails(tech.ref('staff/s9').set({ name: 'x' })))
await t('admin adds placeholder', assertSucceeds(db('admin').ref('staff/s9').set({ name: 'ช่าง ค', role: 'contractor', email: 'c@corp.com', active: true })))
await t('staff e-mail must be lower-case', assertFails(db('admin').ref('staff/s9/email').set('C@corp.com')))
await t('admin sets job prefix', assertSucceeds(db('admin').ref('config/public/jobPrefix').set('WO')))
await t('reporter uses configured prefix', assertSucceeds(create('u1', { ...job, jobNo: 'WO2026-9001', siteId: 's1' }, undefined, 'j9')))
await t('old prefix refused after switch', assertFails(create('u1', { ...job, jobNo: 'VR2026-0009', siteId: 's1' }, undefined, 'j8')))
// assets, materials (stock card) and PM plans — staff only
const adm = db('admin')
await env.withSecurityRulesDisabled((ctx) => ctx.database().ref().update({
  'assetTypes/g1': { nameTh: 'ระบบไฟฟ้า' }, 'assetTypes/t1': { nameTh: 'UPS', parentId: 'g1' },
  'checklists/cl1': { nameTh: 'ฟอร์ม Air', items: { i1: { label: 'ตรวจอุณหภูมิ', order: 1, kind: 'select', options: 'ปกติ,ไม่ปกติ' } } }
}))
await t('user cannot read assets', assertFails(r.ref('assets').once('value')))
await t('contractor cannot read assets', assertFails(c.ref('assets').once('value')))
await t('tech reads asset types', assertSucceeds(tech.ref('assetTypes').once('value')))
await t('tech cannot edit asset types', assertFails(tech.ref('assetTypes/t2').set({ nameTh: 'x' })))
const asset = { code: 'M1-1CDU-01', name: 'แอร์ M108', typeId: 't1', siteId: 's1', buildingId: 'b1', status: 'normal', qty: 1, unit: 'เครื่อง', price: 85000, pm: true, qm: false, checklistId: 'cl1', createdAt: TS, updatedAt: TS, createdBy: 'T', updatedBy: 'T' }
await t('tech creates asset', assertSucceeds(tech.ref('assets/a1').set(asset)))
await t('asset bad status rejected', assertFails(tech.ref('assets/a1/status').set('broken')))
await t('asset unknown type rejected', assertFails(tech.ref('assets/a1/typeId').set('nope')))
await t('client cannot write asset cpfm', assertFails(tech.ref('assets/a1/cpfm').set({ id: '1' })))
await t('contractor cannot write asset', assertFails(c.ref('assets/a2').set(asset)))
await t('tech cannot delete asset', assertFails(tech.ref('assets/a1').remove()))
await t('tech adds asset history', assertSucceeds(tech.ref('assets/a1/history/h1').set({ at: TS, byUid: 'tech', byName: 'T', note: 'แก้ไข' })))
await t('history is append-only', assertFails(tech.ref('assets/a1/history/h1').set({ at: TS, note: 'x' })))
await t('tech logs repair on job', assertSucceeds(tech.ref('assetLogs/l1').set({ assetId: 'a1', action: 'repair', at: 1, detail: 'เปลี่ยน capacitor', qty: 1, cost: 300, jobId: 'j1', jobNo: 'VR2026-0001', byUid: 'tech', byName: 'T', createdAt: TS })))
await t('repair log needs a real asset', assertFails(tech.ref('assetLogs/l2').set({ assetId: 'nope', action: 'repair', at: 1, byUid: 'tech' })))
await t('repair log byUid must be me', assertFails(tech.ref('assetLogs/l3').set({ assetId: 'a1', action: 'repair', at: 1, byUid: 'admin' })))
await t('tech links job to asset', assertSucceeds(tech.ref('jobs/j1/assetId').set('a1')))
await t('job asset must exist', assertFails(tech.ref('jobs/j1/assetId').set('nope')))
await t('tech queries jobs by asset', assertSucceeds(tech.ref('jobs').orderByChild('assetId').equalTo('a1').once('value')))
await t('tech creates material', assertSucceeds(tech.ref('materials/m1').set({ code: 'A01-01-01', name: 'Capacitor 1.5uf', unit: 'ชิ้น', price: 30, min: 5, max: 10, onHand: 0, active: true, createdAt: TS, updatedAt: TS })))
const move = (id, mv) => tech.ref().update({
  [`stockMoves/${id}`]: { materialId: 'm1', qty: 3, at: 1, byUid: 'tech', byName: 'T', createdAt: TS, ...mv },
  'materials/m1/onHand': { '.sv': { increment: mv.delta } }
})
await t('stock in moves on-hand', assertSucceeds(move('k1', { type: 'in', delta: 3 })))
await t('stock out for a job', assertSucceeds(move('k2', { type: 'out', delta: -3, jobId: 'j1', jobNo: 'VR2026-0001' })))
await t('stock delta must match type', assertFails(move('k3', { type: 'out', delta: 3 })))
await t('stock qty must be > 0', assertFails(move('k4', { type: 'in', qty: 0, delta: 0 })))
await t('stock line is append-only', assertFails(tech.ref('stockMoves/k1/qty').set(5)))
await t('admin deletes stock line', assertSucceeds(adm.ref('stockMoves/k2').remove()))
await t('user cannot write stock', assertFails(r.ref('stockMoves/k5').set({ materialId: 'm1', type: 'in', qty: 1, delta: 1, at: 1, byUid: 'u1' })))
await t('tech queries stock by job', assertSucceeds(tech.ref('stockMoves').orderByChild('jobId').equalTo('j1').once('value')))
await t('tech takes PM number', assertSucceeds(tech.ref('counters/pm/2026').transaction((v) => (v || 0) + 1)))
await t('user cannot take PM number', assertFails(r.ref('counters/pm/2026').transaction((v) => (v || 0) + 1)))
const plan = { code: 'PM2026-0001', title: 'Test Run Generator', siteId: 's1', buildingId: 'b1', jobTypeId: 't1', priority: 'normal', start: 1, end: 2, repeat: 'week', every: 1, remind: { n: 15, unit: 'minute' }, active: true, assets: { a1: true }, createdAt: TS, updatedAt: TS }
await t('tech creates PM plan', assertSucceeds(tech.ref('pmPlans/p1').set(plan)))
await t('PM code cannot change', assertFails(tech.ref('pmPlans/p1/code').set('PM2026-0002')))
await t('PM bad repeat rejected', assertFails(tech.ref('pmPlans/p1/repeat').set('fortnight')))
await t('PM work order link', assertSucceeds(tech.ref('pmPlans/p1/jobs/1700000000000').set('j1')))
await t('PM work order must exist', assertFails(tech.ref('pmPlans/p1/jobs/1700000000001').set('nope')))
await t('job remembers its PM plan', assertSucceeds(tech.ref('jobs/j1/pm').set({ planId: 'p1', at: 1700000000000 })))
await t('tech queries jobs by PM plan', assertSucceeds(tech.ref('jobs').orderByChild('pm/planId').equalTo('p1').once('value')))
await t('user cannot read PM plans', assertFails(r.ref('pmPlans').once('value')))
console.log(`\n${pass} passed, ${fail} failed`)
await env.cleanup()
process.exit(fail ? 1 : 0)
