<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { authState, isTech } from '../../stores/auth.js'
import { placeName } from '../../stores/master.js'
import { inv, startInventory, planList } from '../../stores/inventory.js'
import { occurrences, nextDue, repeatText } from '../../services/pmSchedule.js'
import { createPmJob } from '../../services/pm.js'
import { fmtDate, toDateInput, fromDateInput } from '../../i18n/index.js'
import { toast, toastError } from '../../stores/toast.js'

const { t, locale } = useI18n()
startInventory()
const q = ref('')
const showInactive = ref(false)
const shown = computed(() => {
  const s = q.value.trim().toLowerCase()
  return planList.value.filter((p) => (showInactive.value || p.active !== false)
    && (!s || [p.code, p.title, p.detail, placeName(p)].join(' ').toLowerCase().includes(s)))
})

/* Gen. Job ถึง: work orders for every due date from today up to the chosen date that has none yet */
const genTo = ref(toDateInput(Date.now() + 7 * 86400e3))
const busy = ref(false)
const pending = computed(() => {
  const from = new Date().setHours(0, 0, 0, 0)
  const to = (fromDateInput(genTo.value) || 0) + 7 * 3600e3 // through the end of that day
  return planList.value.filter((p) => p.active !== false)
    .flatMap((p) => occurrences(p, from, to, 200).filter((at) => !p.jobs?.[at]).map((at) => ({ plan: p, at })))
})
async function generate() {
  if (!pending.value.length) return toast(t('pm.nothingDue'), 'is-info')
  if (!confirm(t('pm.genConfirm', { n: pending.value.length }))) return
  busy.value = true
  let n = 0
  try {
    for (const { plan, at } of pending.value) { await createPmJob(plan, at, authState, locale.value); n++ }
    toast(t('pm.generated', { n }))
  } catch (e) { toastError(e) } finally { busy.value = false }
}
</script>

<template>
  <section class="section">
    <div class="container">
      <div class="is-flex is-justify-content-space-between is-align-items-center mb-3 is-flex-wrap-wrap" style="gap:.5rem">
        <h1 class="title is-4 mb-0">{{ $t('pm.title') }}</h1>
        <div class="buttons mb-0">
          <router-link to="/pm/calendar" class="button is-small is-light"><span class="icon"><i class="mdi mdi-calendar-month"></i></span><span>{{ $t('nav.pmCalendar') }}</span></router-link>
          <router-link v-if="isTech" to="/pm/new" class="button is-primary is-small"><span class="icon"><i class="mdi mdi-plus"></i></span><span>{{ $t('pm.add') }}</span></router-link>
        </div>
      </div>

      <div class="columns is-mobile is-multiline mb-1">
        <div class="column is-12-mobile is-5-tablet">
          <p class="control has-icons-left"><input class="input" v-model="q" :placeholder="$t('pm.searchPh')" /><span class="icon is-left"><i class="mdi mdi-magnify"></i></span></p>
        </div>
        <div class="column is-12-mobile is-2-tablet is-flex is-align-items-center">
          <label class="checkbox is-size-7"><input type="checkbox" v-model="showInactive" /> {{ $t('material.showInactive') }}</label>
        </div>
        <div class="column is-12-mobile is-5-tablet" v-if="isTech">
          <div class="field has-addons mb-0">
            <div class="control"><span class="button is-static">{{ $t('pm.genTo') }}</span></div>
            <div class="control is-expanded"><input class="input" type="date" v-model="genTo" /></div>
            <div class="control"><button class="button is-primary" :class="{ 'is-loading': busy }" @click="generate">{{ $t('pm.gen') }} ({{ pending.length }})</button></div>
          </div>
          <p class="help">{{ $t('pm.genHelp') }}</p>
        </div>
      </div>

      <p v-if="!inv.loaded"><i class="mdi mdi-loading mdi-spin"></i> {{ $t('common.loading') }}</p>
      <p v-else-if="!shown.length" class="has-text-grey">{{ $t('common.noData') }}</p>
      <div class="columns is-multiline">
        <div class="column is-6-tablet is-4-widescreen" v-for="p in shown" :key="p.id">
          <router-link :to="'/pm/' + p.id" class="has-text-dark">
            <div class="card is-clickable" style="height:100%" :style="p.active === false ? 'opacity:.6' : ''">
              <div class="card-content p-4">
                <div class="is-flex is-justify-content-space-between is-align-items-start mb-1" style="gap:.5rem">
                  <p class="has-text-weight-bold"><i class="mdi mdi-calendar-sync has-text-primary"></i> {{ p.code }}</p>
                  <span class="tag is-light" :class="p.active !== false ? 'is-primary' : ''">{{ p.active !== false ? $t('common.active') : $t('users.inactive') }}</span>
                </div>
                <p class="mb-1">{{ p.title }}</p>
                <p class="is-size-7 has-text-grey"><i class="mdi mdi-map-marker"></i> {{ placeName(p) || '-' }}</p>
                <p class="is-size-7 has-text-grey"><i class="mdi mdi-repeat"></i> {{ repeatText(p, $t) }} · {{ fmtDate(p.start, false) }} – {{ p.end ? fmtDate(p.end, false) : '∞' }}</p>
                <p class="is-size-7 mt-1">
                  <span class="mr-3"><i class="mdi mdi-cog"></i> {{ Object.keys(p.assets || {}).length }}</span>
                  <span class="mr-3"><i class="mdi mdi-clipboard-list"></i> {{ Object.keys(p.jobs || {}).length }}</span>
                  <strong v-if="p.active !== false && nextDue(p)">{{ $t('pm.next') }} {{ fmtDate(nextDue(p)) }}</strong>
                </p>
              </div>
            </div>
          </router-link>
        </div>
      </div>
    </div>
  </section>
</template>
