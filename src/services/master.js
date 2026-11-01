import { ref as dbRef, push, set, update, remove } from 'firebase/database'
import { db } from '../firebase.js'

export const saveItem = (coll, id, data) => (id ? update(dbRef(db, `${coll}/${id}`), data) : set(push(dbRef(db, coll)), data))
export const deleteItem = (coll, id) => remove(dbRef(db, `${coll}/${id}`))

export const DEFAULT_JOB_TYPES = [
  ['ไฟฟ้า', 'Electrical', 'mdi-flash'],
  ['แอร์และระบบระบายอากาศ', 'Air-con & Ventilation', 'mdi-air-conditioner'],
  ['สุขาภิบาลและประปา', 'Sanitary & Plumbing', 'mdi-water-pump'],
  ['อาคารและสถาปัตยกรรม', 'Building / Architecture', 'mdi-office-building'],
  ['ไอที / เครือข่าย', 'IT / Network', 'mdi-lan'],
  ['ระบบแจ้งเหตุเพลิงไหม้', 'Fire Alarm', 'mdi-fire-alert'],
  ['ลิฟต์', 'Elevator / Lift', 'mdi-elevator'],
  ['เครื่องมือวิทยาศาสตร์', 'Scientific Instrument', 'mdi-microscope'],
  ['อุปกรณ์ห้องปฏิบัติการ', 'Laboratory equipment', 'mdi-flask'],
  ['บำรุงรักษาเครื่องจักร', 'Machine maintenance', 'mdi-cog'],
  ['ผู้รับเหมา', 'Contractor', 'mdi-account-hard-hat'],
  ['อื่น ๆ', 'Other', 'mdi-dots-horizontal-circle']
]

export async function seedDefaults() {
  const updates = {}
  DEFAULT_JOB_TYPES.forEach(([th, en, icon], i) => {
    updates[`jobTypes/${push(dbRef(db, 'jobTypes')).key}`] = { nameTh: th, nameEn: en, icon, active: true, order: i + 1 }
  })
  const sId = push(dbRef(db, 'sites')).key
  updates[`sites/${sId}`] = { code: 'VISTEC', nameTh: 'สถาบันวิทยสิริเมธี', nameEn: 'VISTEC', active: true, order: 1 }
  const bId = push(dbRef(db, 'buildings')).key
  // VISTEC Wangchan campus (approx.). Admin should refine per building.
  updates[`buildings/${bId}`] = { siteId: sId, code: 'VISTEC', nameTh: 'สถาบันวิทยสิริเมธี (VISTEC)', nameEn: 'VISTEC', lat: 12.8862, lng: 101.4239, active: true, order: 1 }
  ;['อาคารสำนักงาน', 'อาคารวิจัย', 'หอพัก'].forEach((th, i) => {
    updates[`areas/${push(dbRef(db, 'areas')).key}`] = { buildingId: bId, nameTh: th, nameEn: ['Office building', 'Research building', 'Residence'][i], active: true, order: i + 1 }
  })
  await update(dbRef(db), updates)
}
