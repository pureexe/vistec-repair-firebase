<script setup>
import { ref, reactive, computed, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { authState, isTech } from '../../stores/auth.js'
import { placeName } from '../../stores/master.js'
import { inv, startInventory, planList, assetGroups, typesOf, checklistList, typeName } from '../../stores/inventory.js'
import { ASSET_STATUSES, ASSET_ACTIONS, assetStatusColor, saveRecord, addAssetLog, listenBy } from '../../services/inventory.js'
import { actorOf } from '../../services/jobs.js'
import { ln, fmtDate, toDateInput, fromDateInput } from '../../i18n/index.js'
import { toast, toastError } from '../../stores/toast.js'
import PlaceSelect from '../../components/PlaceSelect.vue'
import JobCard from '../../components/JobCard.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
startInventory()

const id = computed(() => (route.params.id === 'new' ? null : route.params.id))
const asset = computed(() => (id.value ? (inv.assets[id.value] ? { id: id.value, ...inv.assets[id.value] } : null) : null))
const editing = ref(null)
const busy = ref('')
const logs = ref([])
const jobs = ref([])
const plans = computed(() => planList.value.filter((p) => p.assets?.[id.value]))
const checklist = computed(() => inv.checklists[asset.value?.checklistId])

const FIELDS = ['code', 'name', 'typeId', 'siteId', 'buildingId', 'areaId', 'locationDetail', 'status', 'brand', 'model', 'serial', 'supplier',
  'qty', 'unit', 'price', 'installedAt', 'warrantyYears', 'lifeYears', 'pm', 'qm', 'checklistId', 'detail', 'remark']
const NUM = ['qty', 'price', 'warrantyYears', 'lifeYears']
function edit() {
  const a = asset.value || { status: 'normal', qty: 1 }
  const d = Object.fromEntries(FIELDS.map((f) => [f, a[f] ?? (['pm', 'qm'].includes(f) ? false : '')]))
  d.installedAt = toDateInput(a.installedAt)
  d.group = inv.assetTypes[a.typeId]?.parentId || a.typeId || ''
  editing.value = reactive(d)
}
watch(id, (v) => { if (!v) edit() }, { immediate: true })

let unsub = []
watch(id, (v) => {
  unsub.forEach((u) => u()); unsub = []
  logs.value = []; jobs.value = []
  if (!v) return
  unsub.push(listenBy('assetLogs', 'assetId', v, (l) => (logs.value = l)))
  unsub.push(listenBy('jobs', 'assetId', v, (j) => (jobs.value = j)))
}, { immediate: true })
onBeforeUnmount(() => unsub.forEach((u) => u()))

async function save() {
  const e = editing.value
  if (!e.code.trim() || !e.name.trim()) return toast(t('err.required'), 'is-warning')
  const d = Object.fromEntries(FIELDS.map((f) => [f, e[f]]))
  for (const k of NUM) d[k] = d[k] === '' || d[k] === null ? null : Number(d[k])
  for (const k of ['typeId', 'siteId', 'buildingId', 'areaId', 'checklistId']) d[k] = d[k] || null
  d.typeId = e.typeId || e.group || null
  d.installedAt = fromDateInput(e.installedAt)
  d.code = d.code.trim(); d.name = d.name.trim()
  busy.value = 'save'
  try {
    const rid = await saveRecord('assets', id.value, d, actorOf(authState), id.value ? t('asset.edited') : t('asset.created'))
    editing.value = null
    toast(t('common.saved'))
    if (!id.value) router.replace('/assets/' + rid)
  } catch (err) { toastError(err) } finally { busy.value = '' }
}

const logForm = reactive({ open: false, action: 'repair', at: '', detail: '', qty: 1, cost: '', downtime: '', status: '' })
function openLog() { Object.assign(logForm, { open: true, action: 'repair', at: toDateInput(Date.now()), detail: '', qty: 1, cost: '', downtime: '', status: '' }) }
async function saveLog() {
  if (!logForm.detail.trim()) return toast(t('err.required'), 'is-warning')
  busy.value = 'log'
  try {
    await addAssetLog(asset.value, {
      action: logForm.action, at: fromDateInput(logForm.at) || Date.now(), detail: logForm.detail.trim(), qty: Number(logForm.qty) || 1,
      unit: asset.value.unit || '', cost: logForm.cost === '' ? null : Number(logForm.cost), downtime: logForm.downtime || '', status: logForm.status || null
    }, actorOf(authState))
    logForm.open = false
    toast(t('common.saved'))
  } catch (e) { toastError(e) } finally { busy.value = '' }
}
const requestLink = computed(() => asset.value && { path: '/request', query: { asset: asset.value.id, b: asset.value.buildingId || undefined, a: asset.value.areaId || undefined } })
const money = (n) => (n || n === 0 ? Number(n).toLocaleString() : '-')
</script>

<template>
  <section class="section">
    <div class="container" style="max-width:1100px">
      <router-link to="/assets" class="is-size-7"><i class="mdi mdi-arrow-left"></i> {{ $t('asset.title') }}</router-link>
      <p v-if="id && !inv.loaded" class="mt-3"><i class="mdi mdi-loading mdi-spin"></i> {{ $t('common.loading') }}</p>
      <div v-else-if="id && !asset" class="notification is-warning is-light mt-3">{{ $t('common.noData') }}</div>

      <template v-else>
        <div class="is-flex is-justify-content-space-between is-align-items-start mt-2 mb-3 is-flex-wrap-wrap" style="gap:.5rem">
          <div>
            <h1 class="title is-4 mb-1">{{ asset ? asset.code : $t('asset.add') }}</h1>
            <p v-if="asset">{{ asset.name }}</p>
          </div>
          <div v-if="asset" class="buttons mb-0">
            <span class="tag is-medium is-light" :class="assetStatusColor[asset.status || 'normal']">{{ $t('assetStatus.' + (asset.status || 'normal')) }}</span>
            <router-link :to="requestLink" class="button is-small is-primary"><span class="icon"><i class="mdi mdi-plus-circle"></i></span><span>{{ $t('asset.request') }}</span></router-link>
            <button v-if="isTech && !editing" class="button is-small is-light" @click="edit"><span class="icon"><i class="mdi mdi-pencil"></i></span><span>{{ $t('common.edit') }}</span></button>
          </div>
        </div>

        <!-- edit / create -->
        <form v-if="editing" class="box has-background-vistec-soft" @submit.prevent="save">
          <div class="columns is-mobile is-multiline">
            <div class="column is-12-mobile is-4-tablet"><label class="label is-small">{{ $t('asset.code') }} *</label><input class="input is-small" v-model="editing.code" maxlength="80" required /></div>
            <div class="column is-12-mobile is-8-tablet"><label class="label is-small">{{ $t('asset.name') }} *</label><input class="input is-small" v-model="editing.name" maxlength="200" required /></div>
            <div class="column is-6-mobile is-4-tablet"><label class="label is-small">{{ $t('asset.group') }}</label>
              <div class="select is-small is-fullwidth"><select v-model="editing.group" @change="editing.typeId = ''">
                <option value="">-</option><option v-for="g in assetGroups" :key="g.id" :value="g.id">{{ ln(g) }}</option></select></div></div>
            <div class="column is-6-mobile is-4-tablet"><label class="label is-small">{{ $t('asset.type') }}</label>
              <div class="select is-small is-fullwidth"><select v-model="editing.typeId">
                <option value="">-</option><option v-for="ty in typesOf(editing.group)" :key="ty.id" :value="ty.id">{{ ln(ty) }}</option></select></div></div>
            <div class="column is-12-mobile is-4-tablet"><label class="label is-small">{{ $t('asset.status') }}</label>
              <div class="select is-small is-fullwidth"><select v-model="editing.status">
                <option v-for="s in ASSET_STATUSES" :key="s" :value="s">{{ $t('assetStatus.' + s) }}</option></select></div></div>
          </div>
          <PlaceSelect v-model:site="editing.siteId" v-model:building="editing.buildingId" v-model:area="editing.areaId" />
          <div class="columns is-mobile is-multiline">
            <div class="column is-12"><label class="label is-small">{{ $t('asset.installedAt') }} / {{ $t('request.locationDetail') }}</label>
              <div class="field has-addons"><div class="control"><input class="input is-small" type="date" v-model="editing.installedAt" /></div>
                <div class="control is-expanded"><input class="input is-small" v-model="editing.locationDetail" maxlength="200" :placeholder="$t('request.locationDetailPh')" /></div></div></div>
            <div class="column is-6-mobile is-3-tablet"><label class="label is-small">{{ $t('asset.brand') }}</label><input class="input is-small" v-model="editing.brand" maxlength="120" /></div>
            <div class="column is-6-mobile is-3-tablet"><label class="label is-small">{{ $t('asset.model') }}</label><input class="input is-small" v-model="editing.model" maxlength="120" /></div>
            <div class="column is-6-mobile is-3-tablet"><label class="label is-small">{{ $t('asset.serial') }}</label><input class="input is-small" v-model="editing.serial" maxlength="120" /></div>
            <div class="column is-6-mobile is-3-tablet"><label class="label is-small">{{ $t('asset.supplier') }}</label><input class="input is-small" v-model="editing.supplier" maxlength="120" /></div>
            <div class="column is-4-mobile is-2-tablet"><label class="label is-small">{{ $t('asset.qty') }}</label><input class="input is-small" type="number" min="0" v-model="editing.qty" /></div>
            <div class="column is-4-mobile is-2-tablet"><label class="label is-small">{{ $t('asset.unit') }}</label><input class="input is-small" v-model="editing.unit" maxlength="40" /></div>
            <div class="column is-4-mobile is-2-tablet"><label class="label is-small">{{ $t('asset.price') }}</label><input class="input is-small" type="number" min="0" step="any" v-model="editing.price" /></div>
            <div class="column is-6-mobile is-2-tablet"><label class="label is-small">{{ $t('asset.warranty') }}</label><input class="input is-small" type="number" min="0" step="any" v-model="editing.warrantyYears" /></div>
            <div class="column is-6-mobile is-2-tablet"><label class="label is-small">{{ $t('asset.life') }}</label><input class="input is-small" type="number" min="0" step="any" v-model="editing.lifeYears" /></div>
            <div class="column is-12-mobile is-2-tablet is-flex is-align-items-end" style="gap:1rem">
              <label class="checkbox"><input type="checkbox" v-model="editing.pm" /> PM</label>
              <label class="checkbox"><input type="checkbox" v-model="editing.qm" /> QM</label>
            </div>
            <div class="column is-12-mobile is-4-tablet"><label class="label is-small">{{ $t('asset.checklist') }}</label>
              <div class="select is-small is-fullwidth"><select v-model="editing.checklistId">
                <option value="">-</option><option v-for="c in checklistList" :key="c.id" :value="c.id">{{ c.nameTh }}</option></select></div></div>
            <div class="column is-12-mobile is-8-tablet"><label class="label is-small">{{ $t('asset.detail') }}</label><textarea class="textarea is-small" rows="2" v-model="editing.detail" maxlength="3000"></textarea></div>
            <div class="column is-12"><label class="label is-small">{{ $t('asset.remark') }}</label><textarea class="textarea is-small" rows="2" v-model="editing.remark" maxlength="3000"></textarea></div>
          </div>
          <p v-if="asset?.cpfm" class="help is-warning mb-2"><i class="mdi mdi-alert"></i> {{ $t('cpfm.overwritten') }}</p>
          <div class="buttons">
            <button class="button is-primary is-small" :class="{ 'is-loading': busy === 'save' }">{{ $t('common.save') }}</button>
            <button v-if="id" type="button" class="button is-small is-text" @click="editing = null">{{ $t('common.cancel') }}</button>
          </div>
        </form>

        <div v-if="asset" class="columns">
          <div class="column is-7">
            <div class="box">
              <table class="table is-fullwidth is-narrow is-size-7">
                <tbody>
                  <tr><th style="width:35%">{{ $t('asset.type') }}</th><td>{{ typeName(asset.typeId) || '-' }}</td></tr>
                  <tr><th>{{ $t('jobs.location') }}</th><td>{{ placeName(asset) || '-' }}<div v-if="asset.locationDetail">{{ asset.locationDetail }}</div></td></tr>
                  <tr><th>{{ $t('asset.brand') }} / {{ $t('asset.model') }}</th><td>{{ [asset.brand, asset.model].filter(Boolean).join(' · ') || '-' }}</td></tr>
                  <tr v-if="asset.serial"><th>{{ $t('asset.serial') }}</th><td>{{ asset.serial }}</td></tr>
                  <tr v-if="asset.supplier"><th>{{ $t('asset.supplier') }}</th><td>{{ asset.supplier }}</td></tr>
                  <tr><th>{{ $t('asset.qty') }}</th><td>{{ asset.qty ?? '-' }} {{ asset.unit }}</td></tr>
                  <tr><th>{{ $t('asset.price') }}</th><td>{{ money(asset.price) }}</td></tr>
                  <tr><th>{{ $t('asset.installedAt') }}</th><td>{{ fmtDate(asset.installedAt, false) }}</td></tr>
                  <tr><th>{{ $t('asset.warranty') }} / {{ $t('asset.life') }}</th><td>{{ asset.warrantyYears ?? '-' }} / {{ asset.lifeYears ?? '-' }}</td></tr>
                  <tr><th>PM / QM</th><td>{{ asset.pm ? 'PM' : '' }} {{ asset.qm ? 'QM' : '' }}<span v-if="!asset.pm && !asset.qm">-</span></td></tr>
                  <tr v-if="asset.detail"><th>{{ $t('asset.detail') }}</th><td style="white-space:pre-line">{{ asset.detail }}</td></tr>
                  <tr v-if="asset.remark"><th>{{ $t('asset.remark') }}</th><td style="white-space:pre-line">{{ asset.remark }}</td></tr>
                  <tr><th>{{ $t('asset.updated') }}</th><td>{{ fmtDate(asset.updatedAt) }} {{ asset.updatedBy }}</td></tr>
                </tbody>
              </table>
              <template v-if="asset.files">
                <p class="has-text-weight-semibold is-size-7 mb-1">{{ $t('jobs.files') }}</p>
                <a v-for="(f, fid) in asset.files" :key="fid" :href="f.url" target="_blank" rel="noopener" class="is-block is-size-7 mb-1"><i class="mdi mdi-paperclip"></i> {{ f.name }}</a>
              </template>
            </div>

            <!-- repair / maintenance log -->
            <div class="box">
              <div class="is-flex is-justify-content-space-between is-align-items-center mb-2">
                <h2 class="title is-6 mb-0">{{ $t('asset.log') }}</h2>
                <button v-if="isTech" class="button is-small is-primary is-light" @click="logForm.open ? (logForm.open = false) : openLog()"><span class="icon"><i class="mdi mdi-plus"></i></span><span>{{ $t('asset.addLog') }}</span></button>
              </div>
              <form v-if="logForm.open" class="p-3 mb-3 has-background-vistec-soft" style="border-radius:.5rem" @submit.prevent="saveLog">
                <div class="columns is-mobile is-multiline">
                  <div class="column is-6-mobile is-4-tablet"><label class="label is-small">{{ $t('asset.action') }}</label>
                    <div class="select is-small is-fullwidth"><select v-model="logForm.action"><option v-for="a in ASSET_ACTIONS" :key="a" :value="a">{{ $t('assetAction.' + a) }}</option></select></div></div>
                  <div class="column is-6-mobile is-4-tablet"><label class="label is-small">{{ $t('asset.date') }}</label><input class="input is-small" type="date" v-model="logForm.at" /></div>
                  <div class="column is-12-mobile is-4-tablet"><label class="label is-small">{{ $t('asset.newStatus') }}</label>
                    <div class="select is-small is-fullwidth"><select v-model="logForm.status"><option value="">-</option><option v-for="s in ASSET_STATUSES" :key="s" :value="s">{{ $t('assetStatus.' + s) }}</option></select></div></div>
                  <div class="column is-12"><label class="label is-small">{{ $t('asset.detail') }} *</label><textarea class="textarea is-small" rows="2" v-model="logForm.detail" maxlength="3000" required></textarea></div>
                  <div class="column is-4"><label class="label is-small">{{ $t('asset.qty') }}</label><input class="input is-small" type="number" min="0" v-model="logForm.qty" /></div>
                  <div class="column is-4"><label class="label is-small">{{ $t('asset.cost') }}</label><input class="input is-small" type="number" min="0" step="any" v-model="logForm.cost" /></div>
                  <div class="column is-4"><label class="label is-small">{{ $t('asset.downtime') }}</label><input class="input is-small" v-model="logForm.downtime" maxlength="40" /></div>
                </div>
                <button class="button is-primary is-small" :class="{ 'is-loading': busy === 'log' }">{{ $t('common.save') }}</button>
              </form>
              <p v-if="!logs.length" class="has-text-grey is-size-7">{{ $t('common.noData') }}</p>
              <div v-for="l in logs" :key="l.id" class="py-2" style="border-bottom:1px solid #eee">
                <p class="is-size-7"><span class="tag is-light mr-1">{{ $t('assetAction.' + (l.action || 'other')) }}</span>
                  <strong>{{ fmtDate(l.at, false) }}</strong>
                  <router-link v-if="l.jobId" :to="'/jobs/' + l.jobId" class="ml-2">{{ l.jobNo }}</router-link>
                  <span class="has-text-grey ml-2">{{ l.byName }}</span></p>
                <p class="is-size-7" style="white-space:pre-line">{{ l.detail }}</p>
                <p v-if="l.cost || l.downtime" class="is-size-7 has-text-grey">{{ l.cost ? $t('asset.cost') + ' ' + money(l.cost) : '' }} {{ l.downtime ? '· ' + $t('asset.downtime') + ' ' + l.downtime : '' }}</p>
              </div>
            </div>
          </div>

          <div class="column is-5">
            <div class="box" v-if="checklist">
              <h2 class="title is-6">{{ $t('asset.checklist') }}: {{ checklist.nameTh }}</h2>
              <ol class="is-size-7 ml-4">
                <li v-for="(it, k) in checklist.items" :key="k">{{ it.label }} <span class="has-text-grey">({{ it.options || it.kind }})</span></li>
              </ol>
            </div>
            <div class="box">
              <h2 class="title is-6">{{ $t('pm.plans') }}</h2>
              <p v-if="!plans.length" class="has-text-grey is-size-7">{{ $t('common.noData') }}</p>
              <router-link v-for="p in plans" :key="p.id" :to="'/pm/' + p.id" class="is-block is-size-7 mb-1"><i class="mdi mdi-calendar-sync"></i> {{ p.code }} {{ p.title }}</router-link>
            </div>
            <div class="box">
              <h2 class="title is-6">{{ $t('asset.jobs') }}</h2>
              <p v-if="!jobs.length" class="has-text-grey is-size-7">{{ $t('common.noData') }}</p>
              <router-link v-for="j in jobs" :key="j.id" :to="'/jobs/' + j.id" class="has-text-dark"><JobCard :job="j" /></router-link>
            </div>
            <div class="box" v-if="asset.history">
              <h2 class="title is-6">{{ $t('asset.history') }}</h2>
              <p v-for="(h, k) in asset.history" :key="k" class="is-size-7 mb-1"><strong>{{ fmtDate(h.at) }}</strong> {{ h.byName }} — {{ h.note }}</p>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
