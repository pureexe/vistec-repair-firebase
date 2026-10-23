<script setup>
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildingList, jobTypeList, areasOf, master } from '../../stores/master.js'
import { saveItem, deleteItem, seedDefaults } from '../../services/master.js'
import { getPosition } from '../../services/geo.js'
import { ln } from '../../i18n/index.js'
import { toast, toastError } from '../../stores/toast.js'

const { t } = useI18n()
const tab = ref('buildings')
const bSel = ref('')
const editing = ref(null) // { coll, id, data }

const fields = {
  buildings: ['code', 'nameTh', 'nameEn', 'lat', 'lng', 'order', 'active'],
  areas: ['nameTh', 'nameEn', 'order', 'active'],
  jobTypes: ['nameTh', 'nameEn', 'icon', 'order', 'active']
}
const label = (f) => ({ code: t('master.code'), nameTh: t('common.nameTh'), nameEn: t('common.nameEn'), lat: t('master.lat'), lng: t('master.lng'), order: t('common.order'), active: t('common.active'), icon: t('master.icon') }[f])

const rows = computed(() => tab.value === 'buildings' ? buildingList.value : tab.value === 'jobTypes' ? jobTypeList.value : (bSel.value ? areasOf(bSel.value) : []))

function edit(row) {
  const d = {}
  for (const f of fields[tab.value]) d[f] = row ? row[f] ?? (f === 'active' ? true : '') : (f === 'active' ? true : f === 'order' ? rows.value.length + 1 : '')
  editing.value = reactive({ coll: tab.value, id: row?.id || null, data: d })
}
async function save() {
  const e = editing.value
  const d = { ...e.data }
  for (const k of ['lat', 'lng', 'order']) if (k in d) d[k] = d[k] === '' || d[k] === null ? null : Number(d[k])
  if (e.coll === 'areas') d.buildingId = bSel.value
  if (!d.nameTh) return toast(t('err.required'), 'is-warning')
  try { await saveItem(e.coll, e.id, d); editing.value = null; toast(t('common.saved')) } catch (err) { toastError(err) }
}
async function del(row) {
  if (!confirm(`${t('common.delete')} "${ln(row)}"?`)) return
  try { await deleteItem(tab.value, row.id) } catch (err) { toastError(err) }
}
async function here() {
  try { const p = await getPosition(); editing.value.data.lat = p.lat; editing.value.data.lng = p.lng } catch (e) { toast(t('request.gpsDenied'), 'is-warning') }
}
async function seed() {
  if (!confirm(t('master.seedConfirm'))) return
  try { await seedDefaults(); toast(t('master.seeded')) } catch (e) { toastError(e) }
}
</script>

<template>
  <section class="section">
    <div class="container" style="max-width:960px">
      <div class="is-flex is-justify-content-space-between is-align-items-center mb-3">
        <h1 class="title is-4 mb-0">{{ $t('master.title') }}</h1>
        <button v-if="!buildingList.length && !jobTypeList.length" class="button is-small is-primary is-light" @click="seed">{{ $t('master.seed') }}</button>
      </div>
      <div class="tabs is-boxed">
        <ul>
          <li v-for="k in ['buildings', 'areas', 'jobTypes']" :key="k" :class="{ 'is-active': tab === k }"><a @click="tab = k; editing = null">{{ $t('master.' + k) }}</a></li>
        </ul>
      </div>

      <div v-if="tab === 'areas'" class="field">
        <div class="select"><select v-model="bSel">
          <option value="">{{ $t('master.chooseBuilding') }}</option>
          <option v-for="b in buildingList" :key="b.id" :value="b.id">{{ ln(b) }}</option>
        </select></div>
      </div>

      <div v-if="tab !== 'areas' || bSel">
        <button class="button is-primary is-small mb-3" @click="edit(null)"><span class="icon"><i class="mdi mdi-plus"></i></span><span>{{ $t('common.add') }}</span></button>

        <form v-if="editing" class="box has-background-vistec-soft" @submit.prevent="save">
          <div class="columns is-multiline is-mobile">
            <div v-for="f in fields[editing.coll]" :key="f" class="column" :class="['nameTh', 'nameEn'].includes(f) ? 'is-12-mobile is-6-tablet' : 'is-6-mobile is-3-tablet'">
              <label class="label is-small">{{ label(f) }}</label>
              <label v-if="f === 'active'" class="checkbox"><input type="checkbox" v-model="editing.data.active" /> {{ $t('common.active') }}</label>
              <input v-else class="input is-small" v-model="editing.data[f]" :type="['lat', 'lng', 'order'].includes(f) ? 'number' : 'text'" step="any" />
            </div>
          </div>
          <div class="buttons">
            <button class="button is-primary is-small">{{ $t('common.save') }}</button>
            <button v-if="editing.coll === 'buildings'" type="button" class="button is-small is-light" @click="here"><span class="icon"><i class="mdi mdi-crosshairs-gps"></i></span><span>{{ $t('master.useMyLocation') }}</span></button>
            <button type="button" class="button is-small is-text" @click="editing = null">{{ $t('common.cancel') }}</button>
          </div>
        </form>

        <div class="table-container">
          <table class="table is-fullwidth is-hoverable is-size-7">
            <thead><tr>
              <th v-for="f in fields[tab]" :key="f">{{ label(f) }}</th><th></th>
            </tr></thead>
            <tbody>
              <tr v-for="r in rows" :key="r.id" :class="{ 'has-text-grey-light': r.active === false }">
                <td v-for="f in fields[tab]" :key="f">
                  <template v-if="f === 'active'"><i class="mdi" :class="r.active !== false ? 'mdi-check has-text-success' : 'mdi-close'"></i></template>
                  <template v-else-if="f === 'icon'"><i class="mdi" :class="r.icon"></i> {{ r.icon }}</template>
                  <template v-else>{{ r[f] }}</template>
                </td>
                <td class="has-text-right" style="white-space:nowrap">
                  <button class="button is-small is-text" @click="edit(r)"><i class="mdi mdi-pencil"></i></button>
                  <button class="button is-small is-text has-text-danger" @click="del(r)"><i class="mdi mdi-delete"></i></button>
                </td>
              </tr>
              <tr v-if="!rows.length"><td :colspan="fields[tab].length + 1" class="has-text-grey">{{ $t('common.noData') }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>
