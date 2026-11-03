<script setup>
import { ref, reactive, computed, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { authState, isTech } from '../../stores/auth.js'
import { master, placeName, activeJobTypes } from '../../stores/master.js'
import { inv, startInventory, assetList, checklistList } from '../../stores/inventory.js'
import { REPEATS, occurrences, nextDue, repeatText } from '../../services/pmSchedule.js'
import { savePlan, createPmJob } from '../../services/pm.js'
import { listenBy } from '../../services/inventory.js'
import { actorOf } from '../../services/jobs.js'
import { PRIORITIES } from '../../services/util.js'
import { ln, fmtDate } from '../../i18n/index.js'
import { toast, toastError } from '../../stores/toast.js'
import PlaceSelect from '../../components/PlaceSelect.vue'
import StatusTag from '../../components/StatusTag.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
startInventory()

const id = computed(() => (route.params.id === 'new' ? null : route.params.id))
const plan = computed(() => (id.value && inv.pmPlans[id.value] ? { id: id.value, ...inv.pmPlans[id.value] } : null))
const editing = ref(null)
const busy = ref('')
const jobs = ref([])
const jobById = computed(() => Object.fromEntries(jobs.value.map((j) => [j.id, j])))

// <input type=datetime-local> ⇄ ms (local time)
const p2 = (n) => String(n).padStart(2, '0')
const toDT = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}` }
const fromDT = (s) => (s ? new Date(s).getTime() : null)

function edit() {
  const p = plan.value || { repeat: 'month', every: 1, priority: 'normal', active: true, start: new Date().setHours(9, 0, 0, 0) }
  const pmType = activeJobTypes.value.find((x) => x.nameEn === 'Machine maintenance')
  editing.value = reactive({
    title: p.title || '', detail: p.detail || '', siteId: p.siteId || '', buildingId: p.buildingId || '', areaId: p.areaId || '',
    jobTypeId: p.jobTypeId || pmType?.id || '', priority: p.priority || 'normal', start: toDT(p.start), end: toDT(p.end),
    repeat: p.repeat || 'none', every: p.every || 1, remindN: p.remind?.n ?? '', remindUnit: p.remind?.unit || 'day',
    active: p.active !== false, checklistId: p.checklistId || '', assets: { ...(p.assets || {}) }, pick: ''
  })
}
watch(id, (v) => { if (!v) edit() }, { immediate: true })

let unsub = () => {}
watch(id, (v) => { unsub(); jobs.value = []; if (v) unsub = listenBy('jobs', 'pm/planId', v, (j) => (jobs.value = j)) }, { immediate: true })
onBeforeUnmount(() => unsub())

const pickable = computed(() => {
  const e = editing.value
  if (!e) return []
  return assetList.value.filter((a) => !e.assets[a.id] && (!e.buildingId || a.buildingId === e.buildingId))
})
function addAsset() { if (editing.value.pick) { editing.value.assets[editing.value.pick] = true; editing.value.pick = '' } }

async function save() {
  const e = editing.value
  if (!e.title.trim() || !e.buildingId || !e.jobTypeId || !e.start) return toast(t('err.required'), 'is-warning')
  const d = {
    title: e.title.trim(), detail: e.detail, siteId: e.siteId || master.buildings[e.buildingId]?.siteId || null, buildingId: e.buildingId, areaId: e.areaId || null,
    jobTypeId: e.jobTypeId, priority: e.priority, start: fromDT(e.start), end: fromDT(e.end), repeat: e.repeat, every: Math.max(1, Number(e.every) || 1),
    remind: e.remindN === '' ? null : { n: Number(e.remindN), unit: e.remindUnit }, active: e.active, checklistId: e.checklistId || null,
    assets: Object.keys(e.assets).length ? e.assets : null
  }
  busy.value = 'save'
  try {
    const rid = await savePlan(id.value, d, actorOf(authState), id.value ? t('asset.edited') : t('asset.created'))
    editing.value = null
    toast(t('common.saved'))
    if (!id.value) router.replace('/pm/' + rid)
  } catch (err) { toastError(err) } finally { busy.value = '' }
}

/* แผนตามปฏิทิน: due dates of one year, with the work order made for each */
const year = ref(new Date().getFullYear())
const years = computed(() => {
  if (!plan.value?.start) return [year.value]
  const a = new Date(plan.value.start).getFullYear()
  const b = Math.max(new Date(plan.value.end || Date.now()).getFullYear(), new Date().getFullYear())
  return Array.from({ length: Math.min(30, b - a + 1) }, (_, i) => a + i)
})
const dues = computed(() => (plan.value ? occurrences(plan.value, new Date(year.value, 0, 1).getTime(), new Date(year.value + 1, 0, 1).getTime() - 1, 2000) : []))
async function makeJob(at) {
  busy.value = 'job' + at
  try {
    const { jobId, jobNo } = await createPmJob(plan.value, at, authState, locale.value)
    toast(t('pm.generated', { n: 1 }) + ' ' + jobNo)
    router.push('/jobs/' + jobId)
  } catch (e) { toastError(e) } finally { busy.value = '' }
}
</script>

<template>
  <section class="section">
    <div class="container" style="max-width:1100px">
      <router-link to="/pm" class="is-size-7"><i class="mdi mdi-arrow-left"></i> {{ $t('pm.title') }}</router-link>
      <p v-if="id && !inv.loaded" class="mt-3"><i class="mdi mdi-loading mdi-spin"></i> {{ $t('common.loading') }}</p>
      <div v-else-if="id && !plan" class="notification is-warning is-light mt-3">{{ $t('common.noData') }}</div>

      <template v-else>
        <div class="is-flex is-justify-content-space-between is-align-items-start mt-2 mb-3 is-flex-wrap-wrap" style="gap:.5rem">
          <div>
            <h1 class="title is-4 mb-1">{{ plan ? plan.code : $t('pm.add') }}</h1>
            <p v-if="plan">{{ plan.title }}</p>
          </div>
          <div v-if="plan" class="buttons mb-0">
            <span class="tag is-medium is-light" :class="plan.active !== false ? 'is-primary' : ''">{{ plan.active !== false ? $t('common.active') : $t('users.inactive') }}</span>
            <button v-if="isTech && !editing" class="button is-small is-light" @click="edit"><span class="icon"><i class="mdi mdi-pencil"></i></span><span>{{ $t('common.edit') }}</span></button>
          </div>
        </div>

        <form v-if="editing" class="box has-background-vistec-soft" @submit.prevent="save">
          <div class="columns is-mobile is-multiline">
            <div class="column is-12"><label class="label is-small">{{ $t('pm.planTitle') }} *</label><input class="input is-small" v-model="editing.title" maxlength="200" required /></div>
          </div>
          <PlaceSelect v-model:site="editing.siteId" v-model:building="editing.buildingId" v-model:area="editing.areaId" required />
          <div class="columns is-mobile is-multiline">
            <div class="column is-6-mobile is-4-tablet"><label class="label is-small">{{ $t('request.jobType') }} *</label>
              <div class="select is-small is-fullwidth"><select v-model="editing.jobTypeId" required>
                <option value="">{{ $t('request.selectPh') }}</option><option v-for="jt in activeJobTypes" :key="jt.id" :value="jt.id">{{ ln(jt) }}</option></select></div></div>
            <div class="column is-6-mobile is-4-tablet"><label class="label is-small">{{ $t('request.priority') }}</label>
              <div class="select is-small is-fullwidth"><select v-model="editing.priority"><option v-for="p in PRIORITIES" :key="p" :value="p">{{ $t('priority.' + p) }}</option></select></div></div>
            <div class="column is-12-mobile is-4-tablet"><label class="label is-small">{{ $t('asset.checklist') }}</label>
              <div class="select is-small is-fullwidth"><select v-model="editing.checklistId"><option value="">-</option><option v-for="c in checklistList" :key="c.id" :value="c.id">{{ c.nameTh }}</option></select></div></div>
            <div class="column is-12-mobile is-4-tablet"><label class="label is-small">{{ $t('pm.start') }} *</label><input class="input is-small" type="datetime-local" v-model="editing.start" required /></div>
            <div class="column is-6-mobile is-4-tablet"><label class="label is-small">{{ $t('pm.repeat') }}</label>
              <div class="field has-addons"><div class="control" v-if="editing.repeat !== 'none'"><input class="input is-small" type="number" min="1" style="width:4.5rem" v-model="editing.every" /></div>
                <div class="control is-expanded"><div class="select is-small is-fullwidth"><select v-model="editing.repeat"><option v-for="r in REPEATS" :key="r" :value="r">{{ $t('repeat.' + r) }}</option></select></div></div></div></div>
            <div class="column is-6-mobile is-4-tablet"><label class="label is-small">{{ $t('pm.end') }}</label><input class="input is-small" type="datetime-local" v-model="editing.end" :disabled="editing.repeat === 'none'" /></div>
            <div class="column is-12-mobile is-4-tablet"><label class="label is-small">{{ $t('pm.remind') }}</label>
              <div class="field has-addons"><div class="control"><input class="input is-small" type="number" min="0" style="width:4.5rem" v-model="editing.remindN" /></div>
                <div class="control is-expanded"><div class="select is-small is-fullwidth"><select v-model="editing.remindUnit"><option v-for="r in ['minute', 'hour', 'day', 'week']" :key="r" :value="r">{{ $t('repeat.' + r) }}</option></select></div></div></div></div>
            <div class="column is-12-mobile is-8-tablet is-flex is-align-items-end"><label class="checkbox"><input type="checkbox" v-model="editing.active" /> {{ $t('common.active') }}</label></div>
            <div class="column is-12"><label class="label is-small">{{ $t('pm.tasks') }}</label><textarea class="textarea is-small" rows="4" v-model="editing.detail" maxlength="3000"></textarea></div>
            <div class="column is-12">
              <label class="label is-small">{{ $t('pm.assets') }}</label>
              <div class="tags mb-2">
                <span v-for="(v, aid) in editing.assets" :key="aid" class="tag is-primary is-light">{{ inv.assets[aid]?.code || aid }} {{ inv.assets[aid]?.name }}<button type="button" class="delete is-small" @click="delete editing.assets[aid]"></button></span>
              </div>
              <div class="field has-addons">
                <div class="control is-expanded"><div class="select is-small is-fullwidth"><select v-model="editing.pick">
                  <option value="">{{ $t('pm.pickAsset') }}…</option><option v-for="a in pickable" :key="a.id" :value="a.id">{{ a.code }} — {{ a.name }}</option></select></div></div>
                <div class="control"><button type="button" class="button is-small is-primary" :disabled="!editing.pick" @click="addAsset">{{ $t('actions.add') }}</button></div>
              </div>
            </div>
          </div>
          <p v-if="plan?.cpfm" class="help is-warning mb-2"><i class="mdi mdi-alert"></i> {{ $t('cpfm.overwritten') }}</p>
          <div class="buttons">
            <button class="button is-primary is-small" :class="{ 'is-loading': busy === 'save' }">{{ $t('common.save') }}</button>
            <button v-if="id" type="button" class="button is-small is-text" @click="editing = null">{{ $t('common.cancel') }}</button>
          </div>
        </form>

        <div v-if="plan" class="columns">
          <div class="column is-6">
            <div class="box">
              <table class="table is-fullwidth is-narrow is-size-7"><tbody>
                <tr><th style="width:35%">{{ $t('jobs.location') }}</th><td>{{ placeName(plan) || '-' }}</td></tr>
                <tr><th>{{ $t('request.jobType') }}</th><td>{{ ln(master.jobTypes[plan.jobTypeId]) || '-' }}</td></tr>
                <tr><th>{{ $t('request.priority') }}</th><td>{{ $t('priority.' + (plan.priority || 'normal')) }}</td></tr>
                <tr><th>{{ $t('pm.repeat') }}</th><td>{{ repeatText(plan, $t) }}</td></tr>
                <tr><th>{{ $t('pm.start') }} – {{ $t('pm.end') }}</th><td>{{ fmtDate(plan.start) }} – {{ plan.end ? fmtDate(plan.end) : '∞' }}</td></tr>
                <tr v-if="plan.remind"><th>{{ $t('pm.remind') }}</th><td>{{ plan.remind.n }} {{ $t('repeat.' + plan.remind.unit) }}</td></tr>
                <tr><th>{{ $t('pm.next') }}</th><td>{{ plan.active !== false && nextDue(plan) ? fmtDate(nextDue(plan)) : '-' }}</td></tr>
                <tr v-if="plan.checklistId"><th>{{ $t('asset.checklist') }}</th><td>{{ inv.checklists[plan.checklistId]?.nameTh }}</td></tr>
                <tr><th>{{ $t('asset.updated') }}</th><td>{{ fmtDate(plan.updatedAt) }} {{ plan.updatedBy }}</td></tr>
              </tbody></table>
              <p class="has-text-weight-semibold is-size-7 mb-1">{{ $t('pm.tasks') }}</p>
              <p style="white-space:pre-line" class="is-size-7 mb-3">{{ plan.detail || '-' }}</p>
              <p class="has-text-weight-semibold is-size-7 mb-1">{{ $t('pm.assets') }}</p>
              <p v-if="!plan.assets" class="is-size-7 has-text-grey">-</p>
              <router-link v-for="(v, aid) in plan.assets" :key="aid" :to="'/assets/' + aid" class="is-block is-size-7"><i class="mdi mdi-cog"></i> {{ inv.assets[aid]?.code || aid }} {{ inv.assets[aid]?.name }}</router-link>
            </div>
            <div class="box" v-if="plan.history">
              <h2 class="title is-6">{{ $t('asset.history') }}</h2>
              <p v-for="(h, k) in plan.history" :key="k" class="is-size-7 mb-1"><strong>{{ fmtDate(h.at) }}</strong> {{ h.byName }} — {{ h.note }}</p>
            </div>
          </div>

          <div class="column is-6">
            <div class="box">
              <div class="is-flex is-justify-content-space-between is-align-items-center mb-2">
                <h2 class="title is-6 mb-0">{{ $t('pm.schedule') }}</h2>
                <div class="select is-small"><select v-model.number="year"><option v-for="y in years" :key="y" :value="y">{{ y }}</option></select></div>
              </div>
              <p v-if="!dues.length" class="has-text-grey is-size-7">{{ $t('common.noData') }}</p>
              <div class="table-container" v-else style="max-height:28rem;overflow-y:auto">
                <table class="table is-fullwidth is-narrow is-size-7">
                  <tbody>
                    <tr v-for="at in dues" :key="at" :class="{ 'has-text-grey': at < Date.now() && !plan.jobs?.[at] }">
                      <td style="white-space:nowrap">{{ fmtDate(at) }}</td>
                      <td class="has-text-right">
                        <template v-if="plan.jobs?.[at]">
                          <router-link :to="'/jobs/' + plan.jobs[at]">{{ jobById[plan.jobs[at]]?.jobNo || $t('common.view') }}</router-link>
                          <StatusTag v-if="jobById[plan.jobs[at]]" :status="jobById[plan.jobs[at]].status" class="ml-1" />
                        </template>
                        <button v-else-if="isTech && plan.active !== false" class="button is-small is-primary is-light" :class="{ 'is-loading': busy === 'job' + at }" @click="makeJob(at)">{{ $t('pm.makeJob') }}</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div class="box">
              <h2 class="title is-6">{{ $t('pm.jobs') }}</h2>
              <p v-if="!jobs.length" class="has-text-grey is-size-7">{{ $t('common.noData') }}</p>
              <router-link v-for="j in jobs" :key="j.id" :to="'/jobs/' + j.id" class="is-flex is-justify-content-space-between is-size-7 mb-1">
                <span>{{ j.jobNo }} · {{ fmtDate(j.pm?.at) }}</span><StatusTag :status="j.status" />
              </router-link>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
