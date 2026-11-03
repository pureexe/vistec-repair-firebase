export const emailKey = (email) => String(email || '').trim().toLowerCase().replace(/\./g, ',')

// Job numbers are the tracking id: "VR2026-0001". CPFM's are "WO…"; app jobs use /config/public/jobPrefix (default VR)
export const JOB_PREFIX = 'VR'
/** "vr2026 12", "VR2026-0012" → "VR2026-0012"; not a job number → '' */
export function normalizeJobNo(s) {
  const m = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').match(/^([A-Z]{2})(20\d\d)(\d{1,6})$/)
  return m ? `${m[1]}${m[2]}-${m[3].padStart(4, '0')}` : ''
}
/** Assignee keys as one string ",k1,k2," so the DB rules can test membership with contains() */
export const assigneeKeyString = (assignees) => {
  const k = Object.keys(assignees || {})
  return k.length ? `,${k.join(',')},` : null
}

export const STATUSES = ['new', 'assigned', 'in_progress', 'on_hold', 'completed', 'cancelled']
export const OPEN_STATUSES = ['new', 'assigned', 'in_progress', 'on_hold']
export const PRIORITIES = ['normal', 'urgent', 'low', 'callback']
export const HOLD_REASONS = ['waiting_parts', 'budget', 'contractor', 'access', 'other']
export const ROLES = ['user', 'contractor', 'technician', 'admin']
export const STAFF_ROLES = ['contractor', 'technician', 'admin']
export const MAX_PHOTOS = 3

export const statusColor = {
  new: 'is-info', assigned: 'is-link', in_progress: 'is-warning', on_hold: 'is-danger', completed: 'is-success', cancelled: 'is-dark'
}
export const statusIcon = {
  new: 'mdi-inbox-arrow-down', assigned: 'mdi-account-hard-hat', in_progress: 'mdi-progress-wrench', on_hold: 'mdi-pause-circle',
  completed: 'mdi-check-circle', cancelled: 'mdi-close-circle'
}

export const toArray = (obj) => Object.entries(obj || {}).map(([id, v]) => ({ id, ...v }))
export const byOrder = (a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.nameTh || '').localeCompare(String(b.nameTh || ''))
