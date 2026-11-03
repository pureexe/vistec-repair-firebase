<script setup>
import { ref, reactive, computed, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { authState, isTech } from '../../stores/auth.js'
import { inv, startInventory, assetGroups, typesOf, typeName } from '../../stores/inventory.js'
import { saveRecord, addStockMove, listenBy, reorderQty, isLow } from '../../services/inventory.js'
import { actorOf, findJobs } from '../../services/jobs.js'
import { ln, fmtDate, toDateInput, fromDateInput } from '../../i18n/index.js'
import { toast, toastError } from '../../stores/toast.js'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
startInventory()

const id = computed(() => (route.params.id === 'new' ? null : route.params.id))
const mat = computed(() => (id.value && inv.materials[id.value] ? { id: id.value, ...inv.materials[id.value] } : null))
const editing = ref(null)
const busy = ref('')
const moves = ref([])
const storeFilter = ref('')
const stores = computed(() => [...new Set(moves.value.map((m) => m.store).filter(Boolean))])
const shownMoves = computed(() => moves.value.filter((m) => !storeFilter.value || m.store === storeFilter.value))

const FIELDS = ['code', 'name', 'typeId', 'store', 'brand', 'model', 'serial', 'supplier', 'unit', 'price', 'min', 'max', 'detail', 'remark', 'active']
function edit() {
  const m = mat.value || { active: true }
  const d = Object.fromEntries(FIELDS.map((f) => [f, m[f] ?? (f === 'active' ? true : '')]))
  d.group = inv.assetTypes[m.typeId]?.parentId || m.typeId || ''
  editing.value = reactive(d)
}
watch(id, (v) => { if (!v) edit() }, { immediate: true })

let unsub = () => {}
watch(id, (v) => { unsub(); moves.value = []; if (v) unsub = listenBy('stockMoves', 'materialId', v, (l) => (moves.value = l)) }, { immediate: true })
onBeforeUnmount(() => unsub())

async function save() {
  const e = editing.value
  if (!e.code.trim() || !e.name.trim()) return toast(t('err.required'), 'is-warning')
  const d = Object.fromEntries(FIELDS.map((f) => [f, e[f]]))
  for (const k of ['price', 'min', 'max']) d[k] = d[k] === '' || d[k] === null ? null : Number(d[k])
  d.typeId = e.typeId || e.group || null
  d.code = d.code.trim(); d.name = d.name.trim()
  if (!id.value) d.onHand = 0
  busy.value = 'save'
  try {
    const rid = await saveRecord('materials', id.value, d, actorOf(authState), id.value ? t('asset.edited') : t('asset.created'))
    editing.value = null
    toast(t('common.saved'))
    if (!id.value) router.replace('/materials/' + rid)
  } catch (err) { toastError(err) } finally { busy.value = '' }
}

const mv = reactive({ type: '', qty: 1, price: '', store: '', title: '', detail: '', at: '', jobNo: '' })
function openMove(type) {
  Object.assign(mv, { type, qty: 1, price: mat.value.price ?? '', store: mat.value.store || '', title: '', detail: '', at: toDateInput(Date.now()), jobNo: '' })
}
async function saveMove() {
  if (!(Number(mv.qty) > 0)) return toast(t('err.required'), 'is-warning')
  busy.value = 'move'
  try {
    let job = null
    if (mv.jobNo.trim()) {
      job = (await findJobs(mv.jobNo))[0]
      if (!job) { busy.value = ''; return toast(t('material.jobNotFound'), 'is-warning') }
    }
    const m = mat.value
    const note = t('material.usedNote', { name: m.name, qty: mv.qty, unit: m.unit || '' })
    await addStockMove(m, { type: mv.type, qty: Number(mv.qty), price: mv.price === '' ? null : Number(mv.price), store: mv.store, title: mv.title, detail: mv.detail, at: fromDateInput(mv.at) || Date.now() },
      actorOf(authState), job, note)
    mv.type = ''
    toast(t('common.saved'))
  } catch (e) { toastError(e) } finally { busy.value = '' }
}
</script>

<template>
  <section class="section">
    <div class="container" style="max-width:1100px">
      <router-link to="/materials" class="is-size-7"><i class="mdi mdi-arrow-left"></i> {{ $t('material.title') }}</router-link>
      <p v-if="id && !inv.loaded" class="mt-3"><i class="mdi mdi-loading mdi-spin"></i> {{ $t('common.loading') }}</p>
      <div v-else-if="id && !mat" class="notification is-warning is-light mt-3">{{ $t('common.noData') }}</div>

      <template v-else>
        <div class="is-flex is-justify-content-space-between is-align-items-start mt-2 mb-3 is-flex-wrap-wrap" style="gap:.5rem">
          <div>
            <h1 class="title is-4 mb-1">{{ mat ? mat.code : $t('material.add') }}</h1>
            <p v-if="mat">{{ mat.name }} <span v-if="mat.active === false" class="tag is-light">{{ $t('users.inactive') }}</span></p>
          </div>
          <div v-if="mat" class="has-text-right">
            <p class="is-size-3 has-text-weight-bold" :class="isLow(mat) ? 'has-text-danger' : 'has-text-primary'">{{ mat.onHand ?? 0 }} <span class="is-size-6">{{ mat.unit }}</span></p>
            <p class="is-size-7 has-text-grey">{{ $t('material.onHand') }} · Min {{ mat.min ?? '-' }} · Max {{ mat.max ?? '-' }}
              <span v-if="reorderQty(mat)" class="tag is-danger is-light">{{ $t('material.reorder') }} {{ reorderQty(mat) }}</span></p>
          </div>
        </div>

        <form v-if="editing" class="box has-background-vistec-soft" @submit.prevent="save">
          <div class="columns is-mobile is-multiline">
            <div class="column is-12-mobile is-3-tablet"><label class="label is-small">{{ $t('asset.code') }} *</label><input class="input is-small" v-model="editing.code" maxlength="80" required /></div>
            <div class="column is-12-mobile is-9-tablet"><label class="label is-small">{{ $t('asset.name') }} *</label><input class="input is-small" v-model="editing.name" maxlength="200" required /></div>
            <div class="column is-6-mobile is-4-tablet"><label class="label is-small">{{ $t('asset.group') }}</label>
              <div class="select is-small is-fullwidth"><select v-model="editing.group" @change="editing.typeId = ''">
                <option value="">-</option><option v-for="g in assetGroups" :key="g.id" :value="g.id">{{ ln(g) }}</option></select></div></div>
            <div class="column is-6-mobile is-4-tablet"><label class="label is-small">{{ $t('asset.type') }}</label>
              <div class="select is-small is-fullwidth"><select v-model="editing.typeId">
                <option value="">-</option><option v-for="ty in typesOf(editing.group)" :key="ty.id" :value="ty.id">{{ ln(ty) }}</option></select></div></div>
            <div class="column is-12-mobile is-4-tablet"><label class="label is-small">{{ $t('material.store') }}</label><input class="input is-small" v-model="editing.store" maxlength="80" /></div>
            <div class="column is-6-mobile is-3-tablet"><label class="label is-small">{{ $t('asset.brand') }}</label><input class="input is-small" v-model="editing.brand" maxlength="120" /></div>
            <div class="column is-6-mobile is-3-tablet"><label class="label is-small">{{ $t('asset.model') }}</label><input class="input is-small" v-model="editing.model" maxlength="120" /></div>
            <div class="column is-6-mobile is-3-tablet"><label class="label is-small">{{ $t('asset.serial') }}</label><input class="input is-small" v-model="editing.serial" maxlength="120" /></div>
            <div class="column is-6-mobile is-3-tablet"><label class="label is-small">{{ $t('asset.supplier') }}</label><input class="input is-small" v-model="editing.supplier" maxlength="120" /></div>
            <div class="column is-6-mobile is-3-tablet"><label class="label is-small">{{ $t('asset.unit') }}</label><input class="input is-small" v-model="editing.unit" maxlength="40" /></div>
            <div class="column is-6-mobile is-3-tablet"><label class="label is-small">{{ $t('asset.price') }}</label><input class="input is-small" type="number" min="0" step="any" v-model="editing.price" /></div>
            <div class="column is-6-mobile is-3-tablet"><label class="label is-small">Min</label><input class="input is-small" type="number" min="0" v-model="editing.min" /></div>
            <div class="column is-6-mobile is-3-tablet"><label class="label is-small">Max</label><input class="input is-small" type="number" min="0" v-model="editing.max" /></div>
            <div class="column is-12"><label class="label is-small">{{ $t('asset.detail') }}</label><textarea class="textarea is-small" rows="2" v-model="editing.detail" maxlength="3000"></textarea></div>
            <div class="column is-12"><label class="label is-small">{{ $t('asset.remark') }}</label><textarea class="textarea is-small" rows="2" v-model="editing.remark" maxlength="3000"></textarea></div>
            <div class="column is-12"><label class="checkbox"><input type="checkbox" v-model="editing.active" /> {{ $t('common.active') }}</label></div>
          </div>
          <p v-if="mat?.cpfm" class="help is-warning mb-2"><i class="mdi mdi-alert"></i> {{ $t('cpfm.overwritten') }}</p>
          <div class="buttons">
            <button class="button is-primary is-small" :class="{ 'is-loading': busy === 'save' }">{{ $t('common.save') }}</button>
            <button v-if="id" type="button" class="button is-small is-text" @click="editing = null">{{ $t('common.cancel') }}</button>
          </div>
        </form>

        <div v-if="mat" class="columns">
          <div class="column is-4">
            <div class="box">
              <table class="table is-fullwidth is-narrow is-size-7"><tbody>
                <tr><th style="width:40%">{{ $t('asset.type') }}</th><td>{{ typeName(mat.typeId) || '-' }}</td></tr>
                <tr><th>{{ $t('material.store') }}</th><td>{{ mat.store || '-' }}</td></tr>
                <tr><th>{{ $t('asset.brand') }} / {{ $t('asset.model') }}</th><td>{{ [mat.brand, mat.model].filter(Boolean).join(' · ') || '-' }}</td></tr>
                <tr v-if="mat.serial"><th>{{ $t('asset.serial') }}</th><td>{{ mat.serial }}</td></tr>
                <tr v-if="mat.supplier"><th>{{ $t('asset.supplier') }}</th><td>{{ mat.supplier }}</td></tr>
                <tr><th>{{ $t('asset.price') }}</th><td>{{ mat.price != null ? Number(mat.price).toLocaleString() : '-' }}</td></tr>
                <tr v-if="mat.detail"><th>{{ $t('asset.detail') }}</th><td style="white-space:pre-line">{{ mat.detail }}</td></tr>
                <tr v-if="mat.remark"><th>{{ $t('asset.remark') }}</th><td style="white-space:pre-line">{{ mat.remark }}</td></tr>
                <tr><th>{{ $t('asset.updated') }}</th><td>{{ fmtDate(mat.updatedAt) }} {{ mat.updatedBy }}</td></tr>
              </tbody></table>
              <button v-if="isTech && !editing" class="button is-small is-light" @click="edit"><span class="icon"><i class="mdi mdi-pencil"></i></span><span>{{ $t('common.edit') }}</span></button>
            </div>
          </div>

          <div class="column is-8">
            <div class="box">
              <div class="is-flex is-justify-content-space-between is-align-items-center mb-2 is-flex-wrap-wrap" style="gap:.5rem">
                <h2 class="title is-6 mb-0">{{ $t('material.stockCard') }}</h2>
                <div class="buttons mb-0" v-if="isTech">
                  <button class="button is-small is-success is-light" @click="openMove('in')"><span class="icon"><i class="mdi mdi-tray-arrow-down"></i></span><span>{{ $t('material.in') }}</span></button>
                  <button class="button is-small is-danger is-light" @click="openMove('out')"><span class="icon"><i class="mdi mdi-tray-arrow-up"></i></span><span>{{ $t('material.out') }}</span></button>
                </div>
              </div>
              <form v-if="mv.type" class="p-3 mb-3" :class="mv.type === 'in' ? 'has-background-success-light' : ''" :style="mv.type === 'out' ? 'background:var(--vistec-red-soft)' : ''" style="border-radius:.5rem" @submit.prevent="saveMove">
                <p class="has-text-weight-semibold mb-2">{{ $t('material.' + mv.type) }}</p>
                <div class="columns is-mobile is-multiline">
                  <div class="column is-4"><label class="label is-small">{{ $t('asset.qty') }} ({{ mat.unit }})</label><input class="input is-small" type="number" min="1" v-model="mv.qty" required /></div>
                  <div class="column is-4"><label class="label is-small">{{ $t('asset.price') }}</label><input class="input is-small" type="number" min="0" step="any" v-model="mv.price" /></div>
                  <div class="column is-4"><label class="label is-small">{{ $t('asset.date') }}</label><input class="input is-small" type="date" v-model="mv.at" /></div>
                  <div class="column is-6-mobile is-4-tablet"><label class="label is-small">{{ $t('material.store') }}</label><input class="input is-small" v-model="mv.store" maxlength="80" /></div>
                  <div class="column is-6-mobile is-4-tablet" v-if="mv.type === 'out'"><label class="label is-small">{{ $t('material.forJob') }}</label><input class="input is-small" v-model="mv.jobNo" placeholder="WO2026-0001" maxlength="20" /></div>
                  <div class="column is-12-mobile is-4-tablet"><label class="label is-small">{{ $t('material.moveTitle') }}</label><input class="input is-small" v-model="mv.title" maxlength="200" /></div>
                  <div class="column is-12"><label class="label is-small">{{ $t('asset.detail') }}</label><textarea class="textarea is-small" rows="2" v-model="mv.detail" maxlength="1000"></textarea></div>
                </div>
                <div class="buttons">
                  <button class="button is-small" :class="[mv.type === 'in' ? 'is-success' : 'is-danger', { 'is-loading': busy === 'move' }]">{{ $t('common.save') }}</button>
                  <button type="button" class="button is-small is-text" @click="mv.type = ''">{{ $t('common.cancel') }}</button>
                </div>
              </form>
              <div v-if="stores.length > 1" class="select is-small mb-2"><select v-model="storeFilter">
                <option value="">{{ $t('material.store') }}: {{ $t('common.all') }}</option><option v-for="s in stores" :key="s" :value="s">{{ s }}</option></select></div>
              <p v-if="!moves.length" class="has-text-grey is-size-7">{{ $t('common.noData') }}</p>
              <div class="table-container" v-else>
                <table class="table is-fullwidth is-narrow is-size-7">
                  <thead><tr><th>{{ $t('asset.date') }}</th><th>{{ $t('material.moveTitle') }}</th><th class="has-text-right">{{ $t('asset.qty') }}</th><th>{{ $t('material.store') }}</th><th>{{ $t('material.forJob') }}</th></tr></thead>
                  <tbody>
                    <tr v-for="m in shownMoves" :key="m.id">
                      <td style="white-space:nowrap">{{ fmtDate(m.at, false) }}</td>
                      <td>{{ m.title || $t('material.' + m.type) }}<div v-if="m.detail" class="has-text-grey" style="white-space:pre-line">{{ m.detail }}</div><div class="has-text-grey">{{ m.byName }}</div></td>
                      <td class="has-text-right has-text-weight-bold" :class="m.delta < 0 ? 'has-text-danger' : 'has-text-success'" style="white-space:nowrap">{{ m.delta > 0 ? '+' : '' }}{{ m.delta }}</td>
                      <td>{{ m.store }}</td>
                      <td><router-link v-if="m.jobId" :to="'/jobs/' + m.jobId">{{ m.jobNo || $t('common.view') }}</router-link></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
