<script setup>
import { ref, reactive, computed, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ref as dbRef, update } from 'firebase/database'
import { db } from '../firebase.js'
import { authState, isTech, assigneeKeys } from '../stores/auth.js'
import { master, placeName } from '../stores/master.js'
import { ln, fmtDate, toDateInput, fromDateInput } from '../i18n/index.js'
import {
  listenJob, listenEvents, changeStatus, putOnHold, addAssignee, removeAssignee, setExpected, addComment, addPhotos,
  applyJobChange, actorOf, listAssignableStaff
} from '../services/jobs.js'
import { deleteJobPhotoBlob } from '../services/images.js'
import { mapUrl } from '../services/geo.js'
import { HOLD_REASONS, PRIORITIES, MAX_PHOTOS } from '../services/util.js'
import { toast, toastError } from '../stores/toast.js'
import StatusTag from '../components/StatusTag.vue'
import StatusSteps from '../components/StatusSteps.vue'
import HoldBanner from '../components/HoldBanner.vue'
import Timeline from '../components/Timeline.vue'
import PhotoGrid from '../components/PhotoGrid.vue'
import PhotoPicker from '../components/PhotoPicker.vue'
import { inv, startInventory, assetList, materialList } from '../stores/inventory.js'
import { listenBy, addStockMove, addAssetLog, ASSET_ACTIONS } from '../services/inventory.js'

const { t } = useI18n()
const route = useRoute()
const job = ref(undefined)
const events = ref([])
const staff = ref([])
const busy = ref('')
const panel = ref(null) // 'hold' | 'complete' | 'cancel' | 'expected'
const holdForm = reactive({ reason: 'waiting_parts', note: '', partsEta: '', resumeDate: '' })
const expForm = reactive({ date: '', note: '' })
const workDetail = ref('')
const cancelReason = ref('')
const comment = reactive({ text: '', public: false })
const assignee = ref('')
const newPhotos = ref([])

const id = route.params.id
const u1 = listenJob(id, (j) => (job.value = j), (e) => { toastError(e); job.value = null })
const u2 = listenEvents(id, (e) => (events.value = e.reverse()), () => {})
const used = ref([]) // stock moves (materials issued to this job)
const repairs = ref([]) // asset log lines written from this job
let u3 = () => {}, u4 = () => {}
if (isTech.value) {
  listAssignableStaff().then((s) => (staff.value = s)).catch(() => {})
  startInventory()
  u3 = listenBy('stockMoves', 'jobId', id, (m) => (used.value = m))
  u4 = listenBy('assetLogs', 'jobId', id, (l) => (repairs.value = l))
}
onBeforeUnmount(() => { u1(); u2(); u3(); u4() })

watch(job, (j) => {
  if (!j) return
  if (!panel.value) {
    expForm.date = toDateInput(j.expectedDate); expForm.note = j.expectedNote || ''
    workDetail.value = j.workDetail || ''
    if (j.hold) Object.assign(holdForm, { reason: j.hold.reason, note: j.hold.note || '', partsEta: toDateInput(j.hold.partsEta), resumeDate: toDateInput(j.hold.resumeDate) })
  }
})

const actor = computed(() => actorOf(authState))
const isOpen = computed(() => job.value && !['completed', 'cancelled'].includes(job.value.status))
const canEdit = computed(() => isTech.value || assigneeKeys.value.some((k) => job.value?.assignees?.[k]))
const addable = computed(() => staff.value.filter((s) => !job.value?.assignees?.[s.key]))

async function run(key, fn, ok = true) {
  busy.value = key
  try { await fn(); if (ok) toast(t('common.saved')); panel.value = null } catch (e) { toastError(e) } finally { busy.value = '' }
}
const start = () => run('start', () => changeStatus(job.value, 'in_progress', actor.value))
const resume = () => run('resume', () => changeStatus(job.value, 'in_progress', actor.value))
const reopen = () => run('reopen', () => changeStatus(job.value, 'in_progress', actor.value))
const saveHold = () => run('hold', () => putOnHold(job.value, {
  reason: holdForm.reason, note: holdForm.note,
  partsEta: holdForm.reason === 'waiting_parts' ? fromDateInput(holdForm.partsEta) : null,
  resumeDate: fromDateInput(holdForm.resumeDate)
}, actor.value))
const complete = () => run('complete', () => changeStatus(job.value, 'completed', actor.value, { note: workDetail.value, extra: { workDetail: workDetail.value } }))
const cancel = () => run('cancel', () => changeStatus(job.value, 'cancelled', actor.value, { note: cancelReason.value }))
const saveExpected = () => run('expected', () => setExpected(job.value, fromDateInput(expForm.date), expForm.note, actor.value))
async function doAssign() {
  const s = staff.value.find((x) => x.key === assignee.value)
  if (!s) return
  await run('assign', () => addAssignee(job.value, s, actor.value))
  assignee.value = ''
}
function unassign(key, name) {
  if (!confirm(t('actions.removeAssignee', { name }))) return
  run('unassign', () => removeAssignee(job.value, key, actor.value))
}
const setPriority = (p) => run('priority', () => applyJobChange(job.value, { priority: p }, { type: 'comment', note: `${t('request.priority')}: ${t('priority.' + p)}`, public: false }, actor.value))
async function sendComment() {
  if (!comment.text.trim()) return
  await run('comment', () => addComment(job.value, comment.text.trim(), comment.public, actor.value), false)
  comment.text = ''
}
async function uploadPhotos() {
  await run('photos', () => addPhotos(job.value, newPhotos.value, actor.value))
  newPhotos.value = []
}
/* เครื่องจักร / วัสดุอุปกรณ์ on this job (staff) */
const asset = computed(() => job.value?.assetId && inv.assets[job.value.assetId] ? { id: job.value.assetId, ...inv.assets[job.value.assetId] } : null)
const assetChoices = computed(() => assetList.value.filter((a) => !job.value?.buildingId || a.buildingId === job.value.buildingId || a.id === job.value.assetId))
const setAsset = (aid) => run('asset', () => applyJobChange(job.value, { assetId: aid || null },
  { type: 'comment', note: `${t('asset.one')}: ${aid ? inv.assets[aid]?.code + ' ' + inv.assets[aid]?.name : '-'}`, public: false }, actor.value))
const matForm = reactive({ materialId: '', qty: 1 })
const activeMaterials = computed(() => materialList.value.filter((m) => m.active !== false))
async function issueMaterial() {
  const m = inv.materials[matForm.materialId] && { id: matForm.materialId, ...inv.materials[matForm.materialId] }
  if (!m || !(Number(matForm.qty) > 0)) return
  await run('material', () => addStockMove(m, { type: 'out', qty: Number(matForm.qty), title: t('material.outFor', { no: job.value.jobNo }) }, actor.value, job.value,
    t('material.usedNote', { name: m.name, qty: matForm.qty, unit: m.unit || '' })))
  Object.assign(matForm, { materialId: '', qty: 1 })
}
const repForm = reactive({ action: 'repair', detail: '', cost: '' })
async function logRepair() {
  if (!asset.value || !repForm.detail.trim()) return
  await run('repair', () => addAssetLog(asset.value, { action: repForm.action, at: Date.now(), detail: repForm.detail.trim(), qty: 1, unit: asset.value.unit || '', cost: repForm.cost === '' ? null : Number(repForm.cost) },
    actor.value, job.value, `${t('asset.log')} ${asset.value.code}: ${repForm.detail.trim()}`))
  Object.assign(repForm, { action: 'repair', detail: '', cost: '' })
}

async function deletePhoto(pid, meta) {
  if (!confirm(t('common.delete') + '?')) return
  await deleteJobPhotoBlob(job.value.id, pid, meta)
  await update(dbRef(db, `jobs/${job.value.id}/photos`), { [pid]: null })
}
</script>

<template>
  <section class="section">
    <div class="container" style="max-width:1100px">
      <router-link to="/jobs" class="is-size-7"><i class="mdi mdi-arrow-left"></i> {{ $t('common.back') }}</router-link>
      <p v-if="job === undefined" class="mt-3"><i class="mdi mdi-loading mdi-spin"></i> {{ $t('common.loading') }}</p>
      <div v-else-if="job === null" class="notification is-warning is-light mt-3">{{ $t('err.permission') }}</div>

      <template v-else>
        <div class="is-flex is-justify-content-space-between is-align-items-start mt-2 mb-2 is-flex-wrap-wrap" style="gap:.5rem">
          <div>
            <h1 class="title is-4 mb-1">{{ job.jobNo }}</h1>
            <router-link :to="'/t/' + job.jobNo" class="is-size-7"><i class="mdi mdi-open-in-new"></i> {{ $t('jobs.publicPage') }}</router-link>
          </div>
          <StatusTag :status="job.status" size="is-medium" />
        </div>
        <StatusSteps :status="job.status" />

        <div class="columns">
          <!-- left: details -->
          <div class="column is-7">
            <div class="box">
              <h2 class="title is-6">{{ $t('jobs.detail') }}</h2>
              <table class="table is-fullwidth is-narrow is-size-7">
                <tbody>
                  <tr><th style="width:35%">{{ $t('request.jobType') }}</th><td><i class="mdi" :class="master.jobTypes[job.jobTypeId]?.icon"></i> {{ ln(master.jobTypes[job.jobTypeId]) }}</td></tr>
                  <tr><th>{{ $t('jobs.location') }}</th><td>{{ placeName(job) }}<div v-if="job.locationDetail">{{ job.locationDetail }}</div></td></tr>
                  <tr v-if="job.gps"><th>{{ $t('jobs.gpsLink') }}</th><td><a :href="mapUrl(job.gps)" target="_blank" rel="noopener"><i class="mdi mdi-map-marker"></i> {{ job.gps.lat }}, {{ job.gps.lng }} (±{{ job.gps.accuracy }} m)</a></td></tr>
                  <tr><th>{{ $t('request.priority') }}</th><td>
                    <div v-if="isTech" class="select is-small"><select :value="job.priority" @change="setPriority($event.target.value)">
                      <option v-for="p in PRIORITIES" :key="p" :value="p">{{ $t('priority.' + p) }}</option></select></div>
                    <span v-else>{{ $t('priority.' + job.priority) }}</span>
                  </td></tr>
                  <tr><th>{{ $t('jobs.createdAt') }}</th><td>{{ fmtDate(job.createdAt) }}</td></tr>
                  <tr><th>{{ $t('jobs.reporter') }}</th><td>
                    {{ job.reporter?.name }} <span v-if="job.reporter?.department" class="has-text-grey">({{ job.reporter.department }})</span><br />
                    <a :href="'tel:' + job.reporter?.phone"><i class="mdi mdi-phone"></i> {{ job.reporter?.phone }}</a> ·
                    <a :href="'mailto:' + job.reporter?.email"><i class="mdi mdi-email"></i> {{ job.reporter?.email }}</a>
                  </td></tr>
                  <tr><th>{{ $t('jobs.assignee') }}</th><td>
                    <div v-if="job.assignees" class="tags mb-0">
                      <span v-for="(name, key) in job.assignees" :key="key" class="tag is-primary is-light">
                        {{ name }}<button v-if="isTech" class="delete is-small" :title="$t('common.delete')" @click="unassign(key, name)"></button>
                      </span>
                    </div>
                    <span v-else>{{ job.assigneeName || $t('jobs.unassigned') }}</span>
                  </td></tr>
                  <tr v-if="job.completedAt"><th>{{ $t('status.completed') }}</th><td>{{ fmtDate(job.completedAt) }}</td></tr>
                  <tr v-if="isTech || job.assetId"><th>{{ $t('asset.one') }}</th><td>
                    <div v-if="isTech" class="select is-small" style="max-width:100%"><select :value="job.assetId || ''" @change="setAsset($event.target.value)">
                      <option value="">-</option>
                      <option v-for="a in assetChoices" :key="a.id" :value="a.id">{{ a.code }} — {{ a.name }}</option></select></div>
                    <router-link v-if="asset" :to="'/assets/' + asset.id" class="ml-2"><i class="mdi mdi-cog"></i> {{ $t('common.view') }}</router-link>
                  </td></tr>
                  <tr v-if="job.pm"><th>{{ $t('pm.one') }}</th><td>
                    <router-link v-if="isTech" :to="'/pm/' + job.pm.planId"><i class="mdi mdi-calendar-sync"></i> {{ inv.pmPlans[job.pm.planId]?.code || job.pm.planId }}</router-link>
                    {{ inv.pmPlans[job.pm.planId]?.title }} · {{ fmtDate(job.pm.at) }}
                  </td></tr>
                </tbody>
              </table>
              <p class="has-text-weight-semibold is-size-7 mb-1">{{ $t('request.description') }}</p>
              <p style="white-space:pre-line" class="mb-3">{{ job.description }}</p>
              <template v-if="job.workDetail">
                <p class="has-text-weight-semibold is-size-7 mb-1">{{ $t('jobs.workDetail') }}</p>
                <p style="white-space:pre-line">{{ job.workDetail }}</p>
              </template>
            </div>

            <div class="box">
              <h2 class="title is-6">{{ $t('jobs.photos') }}</h2>
              <PhotoGrid :job-id="job.id" :photos="job.photos" :deletable="isTech" @delete="deletePhoto" />
              <template v-if="job.files">
                <p class="has-text-weight-semibold is-size-7 mt-3 mb-1">{{ $t('jobs.files') }}</p>
                <a v-for="(f, fid) in job.files" :key="fid" :href="f.url" target="_blank" rel="noopener" class="is-block is-size-7 mb-1">
                  <i class="mdi" :class="/^(mp4|mov|avi|3gp|webm)$/.test(f.type) ? 'mdi-file-video' : 'mdi-paperclip'"></i>
                  {{ f.name }} <span class="has-text-grey">({{ (f.bytes / 1048576).toFixed(1) }} MB)</span>
                </a>
              </template>
              <div class="mt-3" v-if="canEdit">
                <PhotoPicker v-model="newPhotos" :max="MAX_PHOTOS" />
                <button v-if="newPhotos.length" class="button is-primary is-small mt-2" :class="{ 'is-loading': busy === 'photos' }" @click="uploadPhotos">{{ $t('common.save') }}</button>
              </div>
            </div>

            <div class="box" v-if="isTech">
              <h2 class="title is-6">{{ $t('material.used') }}</h2>
              <p v-if="!used.length && !repairs.length" class="has-text-grey is-size-7 mb-2">{{ $t('common.noData') }}</p>
              <p v-for="m in used" :key="m.id" class="is-size-7 mb-1">
                <router-link :to="'/materials/' + m.materialId">{{ m.code }}</router-link> {{ m.name }} ·
                <strong :class="m.delta < 0 ? 'has-text-danger' : 'has-text-success'">{{ m.delta }}</strong> {{ m.unit }}
                <span class="has-text-grey">· {{ fmtDate(m.at, false) }} {{ m.byName }}</span>
              </p>
              <p v-for="l in repairs" :key="l.id" class="is-size-7 mb-1">
                <i class="mdi mdi-cog"></i> <router-link :to="'/assets/' + l.assetId">{{ inv.assets[l.assetId]?.code || l.assetId }}</router-link>
                <span class="tag is-light mx-1">{{ $t('assetAction.' + (l.action || 'other')) }}</span>{{ l.detail }}
                <span class="has-text-grey">· {{ fmtDate(l.at, false) }}</span>
              </p>
              <form class="field has-addons mt-3" @submit.prevent="issueMaterial">
                <div class="control is-expanded"><div class="select is-small is-fullwidth"><select v-model="matForm.materialId">
                  <option value="">{{ $t('material.issue') }}…</option>
                  <option v-for="m in activeMaterials" :key="m.id" :value="m.id">{{ m.code }} {{ m.name }} ({{ m.onHand ?? 0 }} {{ m.unit }})</option></select></div></div>
                <div class="control"><input class="input is-small" type="number" min="1" v-model="matForm.qty" style="width:4.5rem" /></div>
                <div class="control"><button class="button is-small is-danger is-light" :disabled="!matForm.materialId" :class="{ 'is-loading': busy === 'material' }">{{ $t('material.out') }}</button></div>
              </form>
              <form v-if="asset" class="mt-2" @submit.prevent="logRepair">
                <div class="field has-addons mb-1">
                  <div class="control"><div class="select is-small"><select v-model="repForm.action"><option v-for="a in ASSET_ACTIONS" :key="a" :value="a">{{ $t('assetAction.' + a) }}</option></select></div></div>
                  <div class="control is-expanded"><input class="input is-small" v-model="repForm.detail" maxlength="3000" :placeholder="$t('asset.logPh', { code: asset.code })" /></div>
                  <div class="control"><input class="input is-small" type="number" min="0" step="any" v-model="repForm.cost" :placeholder="$t('asset.cost')" style="width:6rem" /></div>
                  <div class="control"><button class="button is-small is-primary is-light" :disabled="!repForm.detail.trim()" :class="{ 'is-loading': busy === 'repair' }">{{ $t('common.save') }}</button></div>
                </div>
              </form>
            </div>

            <div class="box">
              <h2 class="title is-6">{{ $t('jobs.timeline') }}</h2>
              <form @submit.prevent="sendComment" class="mb-4" v-if="canEdit">
                <textarea class="textarea is-small mb-2" rows="2" v-model="comment.text" :placeholder="$t('jobs.commentPh')" maxlength="2000"></textarea>
                <div class="is-flex is-justify-content-space-between is-align-items-center">
                  <label class="checkbox is-size-7"><input type="checkbox" v-model="comment.public" /> {{ $t('jobs.publicComment') }}</label>
                  <button class="button is-small is-primary" :class="{ 'is-loading': busy === 'comment' }">{{ $t('common.send') }}</button>
                </div>
              </form>
              <Timeline :events="events" staff />
            </div>
          </div>

          <!-- right: actions -->
          <div class="column is-5">
            <HoldBanner :status="job.status" :hold="job.hold" :expected-date="job.expectedDate" :expected-note="job.expectedNote" />

            <div class="box action-box" v-if="canEdit">
              <h2 class="title is-6 mb-2">{{ $t('actions.title') }}</h2>
              <p class="is-size-7 has-text-grey mb-3"><i class="mdi mdi-email-fast"></i> {{ $t('actions.notifyNote') }}</p>

              <div v-if="isTech && isOpen" class="field has-addons">
                <div class="control is-expanded"><div class="select is-fullwidth is-small"><select v-model="assignee">
                  <option value="">{{ $t('actions.addAssignee') }}…</option>
                  <option v-for="s in addable" :key="s.key" :value="s.key">{{ s.name }} ({{ $t('roles.' + s.role) }}{{ s.company ? ' · ' + s.company : '' }}{{ s.noAccount ? ' · ' + $t('users.noAccount') : '' }})</option>
                </select></div></div>
                <div class="control"><button class="button is-small is-primary" :disabled="!assignee" :class="{ 'is-loading': busy === 'assign' }" @click="doAssign"><span class="icon"><i class="mdi mdi-account-plus"></i></span><span>{{ $t('actions.add') }}</span></button></div>
              </div>

              <div class="buttons is-stacked-mobile">
                <button v-if="['new', 'assigned'].includes(job.status)" class="button is-warning" :class="{ 'is-loading': busy === 'start' }" @click="start"><span class="icon"><i class="mdi mdi-play"></i></span><span>{{ $t('actions.start') }}</span></button>
                <button v-if="job.status === 'on_hold'" class="button is-warning" :class="{ 'is-loading': busy === 'resume' }" @click="resume"><span class="icon"><i class="mdi mdi-play"></i></span><span>{{ $t('actions.resume') }}</span></button>
                <button v-if="isOpen" class="button is-danger is-light" @click="panel = panel === 'hold' ? null : 'hold'"><span class="icon"><i class="mdi mdi-pause"></i></span><span>{{ $t('actions.hold') }}</span></button>
                <button v-if="isOpen" class="button is-light" @click="panel = panel === 'expected' ? null : 'expected'"><span class="icon"><i class="mdi mdi-calendar-edit"></i></span><span>{{ $t('actions.setExpected') }}</span></button>
                <button v-if="isOpen" class="button is-success" @click="panel = panel === 'complete' ? null : 'complete'"><span class="icon"><i class="mdi mdi-check"></i></span><span>{{ $t('actions.complete') }}</span></button>
                <button v-if="isOpen && isTech" class="button is-dark is-outlined" @click="panel = panel === 'cancel' ? null : 'cancel'"><span class="icon"><i class="mdi mdi-close"></i></span><span>{{ $t('actions.cancelJob') }}</span></button>
                <button v-if="!isOpen && isTech" class="button is-light" :class="{ 'is-loading': busy === 'reopen' }" @click="reopen"><span class="icon"><i class="mdi mdi-restore"></i></span><span>{{ $t('actions.reopen') }}</span></button>
              </div>

              <!-- hold -->
              <form v-if="panel === 'hold'" @submit.prevent="saveHold" class="mt-3 p-3" style="background:var(--vistec-red-soft);border-radius:.5rem">
                <div class="field"><label class="label is-small">{{ $t('hold.title') }}</label>
                  <div class="select is-fullwidth is-small"><select v-model="holdForm.reason">
                    <option v-for="r in HOLD_REASONS" :key="r" :value="r">{{ $t('hold.' + r) }}</option></select></div></div>
                <div class="field" v-if="holdForm.reason === 'waiting_parts'"><label class="label is-small">{{ $t('hold.partsEta') }}</label><input class="input is-small" type="date" v-model="holdForm.partsEta" /></div>
                <div class="field"><label class="label is-small">{{ $t('hold.resumeDate') }}</label><input class="input is-small" type="date" v-model="holdForm.resumeDate" /></div>
                <div class="field"><label class="label is-small">{{ $t('hold.note') }}</label><textarea class="textarea is-small" rows="2" v-model="holdForm.note" maxlength="1000"></textarea></div>
                <button class="button is-danger is-small" :class="{ 'is-loading': busy === 'hold' }">{{ $t('common.save') }}</button>
              </form>

              <!-- expected -->
              <form v-if="panel === 'expected'" @submit.prevent="saveExpected" class="mt-3 p-3 has-background-vistec-soft" style="border-radius:.5rem">
                <div class="field"><label class="label is-small">{{ $t('track.expected') }}</label><input class="input is-small" type="date" v-model="expForm.date" /></div>
                <div class="field"><label class="label is-small">{{ $t('actions.expectedNote') }}</label><textarea class="textarea is-small" rows="2" v-model="expForm.note" maxlength="1000"></textarea></div>
                <button class="button is-primary is-small" :class="{ 'is-loading': busy === 'expected' }">{{ $t('common.save') }}</button>
              </form>

              <!-- complete -->
              <form v-if="panel === 'complete'" @submit.prevent="complete" class="mt-3 p-3 has-background-success-light" style="border-radius:.5rem">
                <div class="field"><label class="label is-small">{{ $t('actions.workDone') }}</label><textarea class="textarea is-small" rows="3" v-model="workDetail" required maxlength="3000"></textarea></div>
                <button class="button is-success is-small" :class="{ 'is-loading': busy === 'complete' }">{{ $t('actions.complete') }}</button>
              </form>

              <!-- cancel -->
              <form v-if="panel === 'cancel'" @submit.prevent="cancel" class="mt-3 p-3 has-background-light" style="border-radius:.5rem">
                <div class="field"><label class="label is-small">{{ $t('actions.reason') }}</label><textarea class="textarea is-small" rows="2" v-model="cancelReason" required maxlength="1000"></textarea></div>
                <button class="button is-dark is-small" :class="{ 'is-loading': busy === 'cancel' }">{{ $t('actions.cancelJob') }}</button>
              </form>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
