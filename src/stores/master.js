import { reactive, computed } from 'vue'
import { ref as dbRef, onValue } from 'firebase/database'
import { db } from '../firebase.js'
import { toArray, byOrder } from '../services/util.js'

export const master = reactive({ buildings: {}, areas: {}, jobTypes: {}, loaded: false })

let started = false
export function startMaster() {
  if (started) return
  started = true
  let n = 0
  const done = () => { if (++n >= 3) master.loaded = true }
  for (const k of ['buildings', 'areas', 'jobTypes']) {
    onValue(dbRef(db, k), (s) => { master[k] = s.val() || {}; done() }, (e) => { console.warn(k, e); done() })
  }
}

export const buildingList = computed(() => toArray(master.buildings).sort(byOrder))
export const activeBuildings = computed(() => buildingList.value.filter((b) => b.active !== false))
export const jobTypeList = computed(() => toArray(master.jobTypes).sort(byOrder))
export const activeJobTypes = computed(() => jobTypeList.value.filter((b) => b.active !== false))
export const areasOf = (buildingId) => toArray(master.areas).filter((a) => a.buildingId === buildingId).sort(byOrder)
