import { createI18n } from 'vue-i18n'
import th from './th.js'
import en from './en.js'

function initialLocale() {
  try { const v = localStorage.getItem('lang'); if (v === 'en' || v === 'th') return v } catch {}
  return 'th' // Thai is the default
}

export const i18n = createI18n({ legacy: false, globalInjection: true, locale: initialLocale(), fallbackLocale: 'th', messages: { th, en } })

export function setLocale(l) {
  i18n.global.locale.value = l
  try { localStorage.setItem('lang', l) } catch {}
  document.documentElement.lang = l
}

/** Localised name from a master-data record ({nameTh, nameEn}). */
export function ln(rec) {
  if (!rec) return ''
  return (i18n.global.locale.value === 'en' ? rec.nameEn || rec.nameTh : rec.nameTh || rec.nameEn) || ''
}

export function fmtDate(ms, withTime = true) {
  if (!ms) return '-'
  const loc = i18n.global.locale.value === 'en' ? 'en-GB' : 'th-TH'
  const opt = { day: 'numeric', month: 'short', year: 'numeric' }
  if (withTime) Object.assign(opt, { hour: '2-digit', minute: '2-digit' })
  return new Date(ms).toLocaleString(loc, opt)
}

/** yyyy-mm-dd for <input type=date> */
export function toDateInput(ms) {
  if (!ms) return ''
  const d = new Date(ms); const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export function fromDateInput(s) {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 17, 0, 0).getTime() // end of working day
}
