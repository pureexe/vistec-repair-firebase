export const emailKey = (email) => String(email || '').trim().toLowerCase().replace(/\./g, ',')

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I
export function randomCode(len = 8) {
  const a = new Uint32Array(len); crypto.getRandomValues(a)
  return Array.from(a, (x) => ALPHA[x % ALPHA.length]).join('')
}
export const normalizeCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

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
