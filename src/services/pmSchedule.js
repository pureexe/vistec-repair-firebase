/**
 * When a preventive-maintenance plan is due. A plan repeats every `every` × `repeat` from `start` until `end`
 * (CPFM "วนซ้ำทุกๆ N … จนถึง"). Pure JS (no imports): scripts/import-cpfm.mjs uses it too.
 * Months / quarters / years keep the day of the month (31 Jan + 1 month = 28/29 Feb). Calendar steps are taken in
 * Bangkok time (UTC+7, no daylight saving) so every browser and the importer get the same dates as CPFM.
 * `end` is exclusive, as in CPFM (a weekly plan from 10 Jan 2026 to 9 Jan 2027 has 52 dates).
 */
const BKK = 7 * 3600e3
export const REPEATS = ['none', 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year']
const FIXED = { minute: 60e3, hour: 3600e3 }
const DAYS = { day: 1, week: 7 }
const MONTHS = { month: 1, quarter: 3, year: 12 }

function nth(start, k, repeat, every) {
  const n = k * Math.max(1, Number(every) || 1)
  if (FIXED[repeat]) return start + n * FIXED[repeat]
  const d = new Date(start + BKK) // UTC fields of d = Bangkok wall-clock time
  if (DAYS[repeat]) { d.setUTCDate(d.getUTCDate() + n * DAYS[repeat]); return d.getTime() - BKK }
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n * MONTHS[repeat])
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()))
  return d.getTime() - BKK
}

/** Due times (ms) of `plan` = { start, end, repeat, every } between `from` and `to` (inclusive), at most `max`. */
export function occurrences(plan, from, to, max = 1000) {
  const start = Number(plan?.start)
  if (!Number.isFinite(start)) return []
  const last = Math.min(to, plan.end ? plan.end - 1 : Infinity)
  if (!plan.repeat || plan.repeat === 'none' || !REPEATS.includes(plan.repeat)) return start >= from && start <= to ? [start] : []
  const out = []
  // fixed steps: jump straight to `from`
  let k = FIXED[plan.repeat] && from > start ? Math.floor((from - start) / (FIXED[plan.repeat] * Math.max(1, Number(plan.every) || 1))) : 0
  for (let t = nth(start, k, plan.repeat, plan.every); t <= last && out.length < max; t = nth(start, ++k, plan.repeat, plan.every)) {
    if (t >= from) out.push(t)
  }
  return out
}

/** The next due time on/after `now` (null when the plan has ended). */
export const nextDue = (plan, now = Date.now()) => occurrences(plan, now, Infinity, 1)[0] ?? null

/** "ทุก 1 สัปดาห์" — `t` is vue-i18n's translate function */
export const repeatText = (plan, t) =>
  !plan.repeat || plan.repeat === 'none' ? t('repeat.none') : t('pm.every', { n: plan.every || 1, unit: t('repeat.' + plan.repeat) })
