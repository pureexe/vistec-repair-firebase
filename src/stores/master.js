import { reactive, computed } from 'vue'
import { ref as dbRef, onValue } from 'firebase/database'
import { db } from '../firebase.js'
import { toArray, byOrder } from '../services/util.js'
import { ln } from '../i18n/index.js'

export const master = reactive({ sites: {}, buildings: {}, areas: {}, jobTypes: {}, loaded: false })

let started = false
export function startMaster() {
  if (started) return
  started = true
  let n = 0
  const done = () => { if (++n >= 4) master.loaded = true }
  for (const k of ['sites', 'buildings', 'areas', 'jobTypes']) {
    onValue(dbRef(db, k), (s) => { master[k] = s.val() || {}; done() }, (e) => { console.warn(k, e); done() })
  }
}

export const siteList = computed(() => toArray(master.sites).sort(byOrder))
export const activeSites = computed(() => siteList.value.filter((s) => s.active !== false))
export const buildingList = computed(() => toArray(master.buildings).sort(byOrder))
export const activeBuildings = computed(() => buildingList.value.filter((b) => b.active !== false))
export const jobTypeList = computed(() => toArray(master.jobTypes).sort(byOrder))
export const activeJobTypes = computed(() => jobTypeList.value.filter((b) => b.active !== false))
/** Buildings of a site ('' = all). Buildings without a site only show under "all". */
export const buildingsOf = (siteId, list = buildingList.value) => (siteId ? list.filter((b) => b.siteId === siteId) : list)
/** "Site › Building › Area" for a job or tracking record; the site is left out when there is only one. */
export function placeName(rec) {
  const parts = []
  const b = master.buildings[rec.buildingId]
  const s = master.sites[rec.siteId || b?.siteId]
  if (s && siteList.value.length > 1) parts.push(ln(s))
  if (b) parts.push(ln(b))
  if (master.areas[rec.areaId]) parts.push(ln(master.areas[rec.areaId]))
  return parts.join(' › ')
}
export const areasOf = (buildingId) => toArray(master.areas).filter((a) => a.buildingId === buildingId).sort(byOrder)
