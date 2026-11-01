/**
 * Sort keys for paging the staff job list (RTDB can filter + sort on one child only).
 * Each job keeps `idx` = one "filter value|createdAt" key per filter combination, e.g.
 * idx.sis = "cpfm_VISTEC|on_hold|0001790000000000". JobsView pages with orderByChild('idx/sis')
 * between "cpfm_VISTEC|on_hold|" and "…|", newest first.
 * Pure JS (no imports) — scripts/import-cpfm.mjs uses it too. Keep keys in sync with the
 * `.indexOn` list in scripts/build-rules.py.
 */
export const OPEN = ['new', 'assigned', 'in_progress', 'on_hold']

export function jobIndex(job, createdAt = job.createdAt) {
  const ts = String(Math.max(0, Math.round(Number(createdAt) || 0))).padStart(16, '0')
  const st = job.status || 'new'
  const o = OPEN.includes(st) ? '1' : '0'
  const site = job.siteId || '-'
  const b = job.buildingId || '-'
  return {
    s: `${st}|${ts}`, o: `${o}|${ts}`,
    si: `${site}|${ts}`, sis: `${site}|${st}|${ts}`, sio: `${site}|${o}|${ts}`,
    b: `${b}|${ts}`, bs: `${b}|${st}|${ts}`, bo: `${b}|${o}|${ts}`
  }
}
export const JOB_INDEX_KEYS = ['s', 'o', 'si', 'sis', 'sio', 'b', 'bs', 'bo']

/** Which child to order by, and the key prefix, for a filter { site, building, status: 'all'|'open'|<status> }. */
export function jobIndexQuery({ site = '', building = '', status = 'all' } = {}) {
  const [scope, val] = building ? ['b', building] : site ? ['si', site] : ['', '']
  const [grp, gval] = status === 'all' ? ['', ''] : status === 'open' ? ['o', '1'] : ['s', status]
  if (!scope && !grp) return { field: 'createdAt', prefix: '' }
  if (!scope) return { field: grp, prefix: `${gval}|` }
  return { field: scope + grp, prefix: grp ? `${val}|${gval}|` : `${val}|` } // si, sis, sio, b, bs, bo
}
