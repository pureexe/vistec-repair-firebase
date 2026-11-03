import { reactive, computed } from 'vue'
import { ref as dbRef, onValue } from 'firebase/database'
import { db } from '../firebase.js'
import { toArray, byOrder } from '../services/util.js'
import { ln } from '../i18n/index.js'

// Assets, materials, PM plans and their master data — small (hundreds of records), staff only, loaded on first use.
const COLLS = ['assets', 'materials', 'pmPlans', 'assetTypes', 'checklists']
export const inv = reactive({ assets: {}, materials: {}, pmPlans: {}, assetTypes: {}, checklists: {}, loaded: false })

let started = false
export function startInventory() {
  if (started) return
  started = true
  let n = 0
  const done = () => { if (++n >= COLLS.length) inv.loaded = true }
  for (const k of COLLS) {
    onValue(dbRef(db, k), (s) => { inv[k] = s.val() || {}; done() }, (e) => { console.warn(k, e); done() })
  }
}

const byCode = (a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'th', { numeric: true })
export const assetList = computed(() => toArray(inv.assets).sort(byCode))
export const materialList = computed(() => toArray(inv.materials).sort(byCode))
export const planList = computed(() => toArray(inv.pmPlans).sort((a, b) => String(b.code || '').localeCompare(String(a.code || ''))))
export const assetTypeList = computed(() => toArray(inv.assetTypes).sort(byOrder))
/** Groups (ระบบงาน) = types without a parent */
export const assetGroups = computed(() => assetTypeList.value.filter((t) => !t.parentId))
export const typesOf = (groupId) => assetTypeList.value.filter((t) => t.parentId === groupId)
export const checklistList = computed(() => toArray(inv.checklists).sort(byCode))
/** "ระบบปรับอากาศ › แอร์แยกส่วน" */
export function typeName(id) {
  const t = inv.assetTypes[id]
  if (!t) return ''
  const g = t.parentId && inv.assetTypes[t.parentId]
  return g ? `${ln(g)} › ${ln(t)}` : ln(t)
}
