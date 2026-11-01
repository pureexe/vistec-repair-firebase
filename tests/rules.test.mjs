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
    invites: { 'new,guy@corp,com': { email: 'new.guy@corp.com', role: 'contractor' } }
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
await t('counter +1', assertSucceeds(r.ref('counters/jobs/2026').transaction((v) => (v || 0) + 1)))
await t('counter jump fails', assertFails(r.ref('counters/jobs/2026').set(99)))
const job = { jobNo: 'WO2026-0001', trackingCode: 'ABCDEFGH', status: 'new', priority: 'normal', jobTypeId: 't1', buildingId: 'b1', locationDetail: '', gps: { lat: 12.1, lng: 101.2, accuracy: 10, at: 1 }, description: 'แอร์เสีย', reporterUid: 'u1', reporter: { name: 'A', email: 'a@b.c', phone: '08', department: '' }, lang: 'th', pdpaAt: TS, createdAt: TS, updatedAt: TS }
const create = (who, j, code = 'ABCDEFGH', id = 'j1') => db(who).ref().update({
  [`jobs/${id}`]: j,
  [`tracking/${code}`]: { jobId: id, jobNo: j.jobNo, status: 'new', jobTypeId: 't1', buildingId: 'b1', createdAt: TS, updatedAt: TS, timeline: { e1: { at: TS, type: 'created', to: 'new', note: '' } } },
  [`jobEvents/${id}/e1`]: { at: TS, byUid: who, byName: 'A', type: 'created', to: 'new', note: '', public: true }
})
await t('u2 cannot create job for u1', assertFails(create('u2', job, 'ZZZZZZZZ', 'jx')))
await t('reporter cannot pre-assign', assertFails(create('u1', { ...job, assigneeUid: 'c1' }, 'YYYYYYYY', 'jy')))
await t('reporter bad siteId rejected', assertFails(create('u1', { ...job, siteId: 'nope' }, 'XXXXXXXX', 'jz')))
await t('reporter creates job', assertSucceeds(create('u1', { ...job, siteId: 's1' })))
await t('anyone reads tracking by code', assertSucceeds(db(null).ref('tracking/ABCDEFGH').once('value')))
await t('cannot list tracking', assertFails(db(null).ref('tracking').once('value')))
await t('other user cannot read job', assertFails(db('u2').ref('jobs/j1').once('value')))
await t('reporter reads own job', assertSucceeds(r.ref('jobs/j1').once('value')))
await t('reporter queries own jobs', assertSucceeds(r.ref('jobs').orderByChild('reporterUid').equalTo('u1').once('value')))
await t('reporter cannot list all jobs', assertFails(r.ref('jobs').once('value')))
await t('reporter cannot read events', assertFails(r.ref('jobEvents/j1').once('value')))
await t('reporter adds photo meta', assertSucceeds(r.ref('jobs/j1/photos/p1').set({ store: 'storage', w: 1280, h: 720, bytes: 90000, path: 'jobs/j1/p1.webp', url: 'https://x', by: 'u1', at: 1 })))
await t('reporter photo too big rejected', assertFails(r.ref('jobs/j1/photos/p2').set({ store: 'storage', w: 4000, h: 3000, bytes: 90000 })))
await t('reporter comments', assertSucceeds(r.ref().update({
  'jobs/j1/updatedAt': TS, 'tracking/ABCDEFGH/updatedAt': TS,
  'jobEvents/j1/e2': { at: TS, byUid: 'u1', byName: 'A', type: 'comment', note: 'hi', public: true, from: null, to: null },
  'tracking/ABCDEFGH/timeline/e2': { at: TS, type: 'comment', to: null, note: 'hi' }
})))
await t('reporter cannot change status', assertFails(r.ref().update({ 'jobs/j1/status': 'completed', 'tracking/ABCDEFGH/status': 'completed' })))
await t('reporter cannot fake status event', assertFails(r.ref('jobEvents/j1/e3').set({ at: TS, byUid: 'u1', type: 'status', to: 'completed', public: true })))

// staff
const tech = db('tech')
await t('tech lists jobs', assertSucceeds(tech.ref('jobs').orderByChild('createdAt').limitToLast(100).once('value')))
await t('tech assigns to contractor', assertSucceeds(tech.ref().update({
  'jobs/j1/assigneeUid': 'c1', 'jobs/j1/assigneeName': 'C', 'jobs/j1/status': 'assigned', 'jobs/j1/updatedAt': TS,
  'tracking/ABCDEFGH/status': 'assigned', 'tracking/ABCDEFGH/updatedAt': TS,
  'jobEvents/j1/e4': { at: TS, byUid: 'tech', byName: 'T', type: 'assign', to: 'C', note: '', public: true },
  'tracking/ABCDEFGH/timeline/e4': { at: TS, type: 'assign', to: 'C', note: '' }
})))
await t('tech cannot change jobNo', assertFails(tech.ref('jobs/j1/jobNo').set('WO2026-0002')))
await t('tech cannot delete job', assertFails(tech.ref('jobs/j1').remove()))
const c = db('c1')
await t('contractor queries assigned', assertSucceeds(c.ref('jobs').orderByChild('assigneeUid').equalTo('c1').once('value')))
await t('contractor cannot list all', assertFails(c.ref('jobs').once('value')))
await t('contractor puts on hold', assertSucceeds(c.ref().update({
  'jobs/j1/status': 'on_hold', 'jobs/j1/hold': { reason: 'waiting_parts', note: 'รออะไหล่', partsEta: 1800000000000, resumeDate: null, since: 1 }, 'jobs/j1/expectedDate': 1800000000000, 'jobs/j1/updatedAt': TS,
  'tracking/ABCDEFGH/status': 'on_hold', 'tracking/ABCDEFGH/hold': { reason: 'waiting_parts', note: 'รออะไหล่', partsEta: 1800000000000 }, 'tracking/ABCDEFGH/expectedDate': 1800000000000, 'tracking/ABCDEFGH/updatedAt': TS,
  'jobEvents/j1/e5': { at: TS, byUid: 'c1', byName: 'C', type: 'hold', to: 'waiting_parts', note: '', public: true },
  'tracking/ABCDEFGH/timeline/e5': { at: TS, type: 'hold', to: 'waiting_parts', note: '' }
})))
await t('contractor cannot reassign', assertFails(c.ref('jobs/j1/assigneeUid').set('c2')))
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
  'jobs/cpfm_1': { ...job, jobNo: 'WO2021-0001', trackingCode: 'CPFMCODE', siteId: 's1', reporterUid: 'cpfm', status: 'in_progress', createdAt: 1, updatedAt: 1, pdpaAt: 1, cpfm: { id: '1', hash: 'x' } },
  'tracking/CPFMCODE': { jobId: 'cpfm_1', jobNo: 'WO2021-0001', status: 'in_progress' }
}))
await t('tech closes imported job', assertSucceeds(tech.ref().update({
  'jobs/cpfm_1/status': 'completed', 'jobs/cpfm_1/updatedAt': TS, 'tracking/CPFMCODE/status': 'completed',
  'jobEvents/cpfm_1/e1': { at: TS, byUid: 'tech', byName: 'T', type: 'status', from: 'in_progress', to: 'completed', note: '', public: true }
})))

// paged job list (src/services/jobIndex.js)
await t('tech pages by sort key', assertSucceeds(tech.ref('jobs').orderByChild('idx/sis').startAt('s1|').endAt('s1|\uf8ff').limitToLast(51).once('value')))
await t('tech finds by jobNo', assertSucceeds(tech.ref('jobs').orderByChild('jobNo').equalTo('WO2026-0001').once('value')))
await t('user cannot page all jobs', assertFails(r.ref('jobs').orderByChild('idx/s').limitToLast(5).once('value')))
await t('tech writes sort keys', assertSucceeds(tech.ref('jobs/j1/idx').set({ s: 'on_hold|0000000000000001', o: '1|0000000000000001' })))
await t('unknown sort key rejected', assertFails(tech.ref('jobs/j1/idx/zz').set('x')))
await t('client cannot write file links', assertFails(tech.ref('jobs/j1/files/f1').set({ name: 'a', url: 'https://x' })))
console.log(`\n${pass} passed, ${fail} failed`)
await env.cleanup()
process.exit(fail ? 1 : 0)
