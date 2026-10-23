<script setup>
import { ref, reactive, computed, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ref as dbRef, update } from 'firebase/database'
import { db } from '../firebase.js'
import { authState, isTech } from '../stores/auth.js'
import { master } from '../stores/master.js'
import { ln, fmtDate, toDateInput, fromDateInput } from '../i18n/index.js'
import {
  listenJob, listenEvents, changeStatus, putOnHold, assignJob, setExpected, addComment, addPhotos,
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
onBeforeUnmount(() => { u1(); u2() })
if (isTech.value) listAssignableStaff().then((s) => (staff.value = s)).catch(() => {})

watch(job, (j) => {
  if (!j) return
  if (!panel.value) {
    expForm.date = toDateInput(j.expectedDate); expForm.note = j.expectedNote || ''
    workDetail.value = j.workDetail || ''
    assignee.value = j.assigneeUid || ''
    if (j.hold) Object.assign(holdForm, { reason: j.hold.reason, note: j.hold.note || '', partsEta: toDateInput(j.hold.partsEta), resumeDate: toDateInput(j.hold.resumeDate) })
  }
})

const actor = computed(() => actorOf(authState))
const isOpen = computed(() => job.value && !['completed', 'cancelled'].includes(job.value.status))
const canEdit = computed(() => isTech.value || job.value?.assigneeUid === authState.user?.uid)

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
function doAssign() {
  const s = staff.value.find((x) => x.uid === assignee.value)
  if (!s) return
  run('assign', () => assignJob(job.value, s, actor.value))
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
            <p class="is-size-7 has-text-grey">{{ $t('request.trackingCode') }}: <router-link :to="'/t/' + job.trackingCode" class="has-text-weight-bold">{{ job.trackingCode }}</router-link></p>
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
                  <tr><th>{{ $t('jobs.location') }}</th><td>{{ ln(master.buildings[job.buildingId]) }}<template v-if="master.areas[job.areaId]"> › {{ ln(master.areas[job.areaId]) }}</template><div v-if="job.locationDetail">{{ job.locationDetail }}</div></td></tr>
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
                  <tr><th>{{ $t('jobs.assignee') }}</th><td>{{ job.assigneeName || $t('jobs.unassigned') }}</td></tr>
                  <tr v-if="job.completedAt"><th>{{ $t('status.completed') }}</th><td>{{ fmtDate(job.completedAt) }}</td></tr>
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
              <div class="mt-3" v-if="canEdit">
                <PhotoPicker v-model="newPhotos" :max="MAX_PHOTOS" />
                <button v-if="newPhotos.length" class="button is-primary is-small mt-2" :class="{ 'is-loading': busy === 'photos' }" @click="uploadPhotos">{{ $t('common.save') }}</button>
              </div>
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
                  <option value="">{{ $t('actions.assignTo') }}…</option>
                  <option v-for="s in staff" :key="s.uid" :value="s.uid">{{ s.name }} ({{ $t('roles.' + s.role) }}{{ s.company ? ' · ' + s.company : '' }})</option>
                </select></div></div>
                <div class="control"><button class="button is-small is-primary" :disabled="!assignee || assignee === job.assigneeUid" :class="{ 'is-loading': busy === 'assign' }" @click="doAssign">{{ $t('actions.assign') }}</button></div>
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
