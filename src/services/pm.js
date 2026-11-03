import { ref as dbRef, update, runTransaction } from 'firebase/database'
import { db } from '../firebase.js'
import { createJob } from './jobs.js'
import { saveRecord } from './inventory.js'

// แผนบำรุงรักษา (/pmPlans). Due dates come from the plan's repeat rule (pmSchedule.js); a work order made for one
// due date is recorded in pmPlans/{id}/jobs/{dueMs} = jobId, so it is never made twice.

/** PM2026-0008: continues after CPFM's numbers (counters/pm/{yyyy} is raised by the importer). */
async function nextPmCode() {
  const year = new Date().getFullYear()
  const res = await runTransaction(dbRef(db, `counters/pm/${year}`), (v) => (v || 0) + 1)
  if (!res.committed) throw new Error('counter')
  return `PM${year}-${String(res.snapshot.val()).padStart(4, '0')}`
}

export async function savePlan(id, data, actor, note = '') {
  const patch = { ...data }
  if (!id) patch.code = await nextPmCode()
  return saveRecord('pmPlans', id, patch, actor, note)
}

/**
 * Work order (ใบแจ้งงาน) for one due date of a plan. The person who presses the button is the reporter.
 * Returns { jobId, jobNo }.
 */
export async function createPmJob(plan, dueAt, authState, lang = 'th') {
  const p = authState.profile || {}
  const u = authState.user
  const assetIds = Object.keys(plan.assets || {})
  const res = await createJob({
    siteId: plan.siteId, buildingId: plan.buildingId, areaId: plan.areaId, locationDetail: '',
    jobTypeId: plan.jobTypeId, priority: plan.priority || 'normal',
    description: [`${plan.code} ${plan.title}`, plan.detail].filter(Boolean).join('\n').slice(0, 3000),
    name: p.displayName || u.displayName || u.email, email: p.email || u.email, phone: p.phone || '-', department: p.department || '',
    lang, assetId: assetIds.length === 1 ? assetIds[0] : null, pm: { planId: plan.id, at: dueAt }, expectedDate: dueAt
  }, [], u)
  await update(dbRef(db), { [`pmPlans/${plan.id}/jobs/${dueAt}`]: res.jobId, [`pmPlans/${plan.id}/lastAt`]: Math.max(plan.lastAt || 0, dueAt) })
  return res
}
