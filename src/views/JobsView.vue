<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { authState, isTech } from '../stores/auth.js'
import { listenAllJobs, listenAssignedJobs } from '../services/jobs.js'
import { activeBuildings, master } from '../stores/master.js'
import { ln } from '../i18n/index.js'
import { STATUSES, OPEN_STATUSES } from '../services/util.js'
import { toastError } from '../stores/toast.js'
import JobCard from '../components/JobCard.vue'

const jobs = ref(null)
const status = ref('open') // 'open' | 'all' | a status
const building = ref('')
const q = ref('')
const mine = ref(false)

const unsub = isTech.value
  ? listenAllJobs((j) => (jobs.value = j), 2000, (e) => { toastError(e); jobs.value = [] })
  : listenAssignedJobs(authState.user.uid, (j) => (jobs.value = j), (e) => { toastError(e); jobs.value = [] })
onBeforeUnmount(unsub)

const counts = computed(() => {
  const c = { open: 0, all: 0 }
  for (const j of jobs.value || []) { c.all++; c[j.status] = (c[j.status] || 0) + 1; if (OPEN_STATUSES.includes(j.status)) c.open++ }
  return c
})

const filtered = computed(() => {
  const s = q.value.trim().toLowerCase()
  return (jobs.value || []).filter((j) => {
    if (status.value === 'open' && !OPEN_STATUSES.includes(j.status)) return false
    if (!['open', 'all'].includes(status.value) && j.status !== status.value) return false
    if (building.value && j.buildingId !== building.value) return false
    if (mine.value && j.assigneeUid !== authState.user.uid) return false
    if (s) {
      const hay = [j.jobNo, j.trackingCode, j.description, j.reporter?.name, j.reporter?.email, j.assigneeName, j.locationDetail, ln(master.jobTypes[j.jobTypeId])].join(' ').toLowerCase()
      if (!hay.includes(s)) return false
    }
    return true
  })
})
const shown = ref(60)
</script>

<template>
  <section class="section">
    <div class="container">
      <div class="is-flex is-justify-content-space-between is-align-items-center mb-3" style="gap:.5rem">
        <h1 class="title is-4 mb-0">{{ isTech ? $t('jobs.title') : $t('jobs.assignedToMe') }}</h1>
        <span class="tag is-light">{{ $t('jobs.count', { n: filtered.length }) }}</span>
      </div>

      <div class="tabs is-small is-toggle mb-3" style="overflow-x:auto">
        <ul>
          <li :class="{ 'is-active': status === 'open' }"><a @click="status = 'open'">{{ $t('jobs.openOnly') }} ({{ counts.open }})</a></li>
          <li v-for="s in STATUSES" :key="s" :class="{ 'is-active': status === s }"><a @click="status = s">{{ $t('status.' + s) }} ({{ counts[s] || 0 }})</a></li>
          <li :class="{ 'is-active': status === 'all' }"><a @click="status = 'all'">{{ $t('common.all') }} ({{ counts.all }})</a></li>
        </ul>
      </div>

      <div class="columns is-mobile is-multiline mb-1">
        <div class="column is-12-mobile is-6-tablet">
          <p class="control has-icons-left"><input class="input" v-model="q" :placeholder="$t('jobs.searchPh')" /><span class="icon is-left"><i class="mdi mdi-magnify"></i></span></p>
        </div>
        <div class="column is-8-mobile is-4-tablet">
          <div class="select is-fullwidth"><select v-model="building">
            <option value="">{{ $t('request.building') }}: {{ $t('common.all') }}</option>
            <option v-for="b in activeBuildings" :key="b.id" :value="b.id">{{ ln(b) }}</option>
          </select></div>
        </div>
        <div class="column is-4-mobile is-2-tablet is-flex is-align-items-center" v-if="isTech">
          <label class="checkbox is-size-7"><input type="checkbox" v-model="mine" /> {{ $t('jobs.assignedToMe') }}</label>
        </div>
      </div>

      <p v-if="jobs === null"><i class="mdi mdi-loading mdi-spin"></i> {{ $t('common.loading') }}</p>
      <p v-else-if="!filtered.length" class="has-text-grey">{{ $t('jobs.empty') }}</p>
      <div class="columns is-multiline">
        <div class="column is-6-tablet is-4-widescreen" v-for="j in filtered.slice(0, shown)" :key="j.id">
          <router-link :to="'/jobs/' + j.id" class="has-text-dark"><JobCard :job="j" show-reporter /></router-link>
        </div>
      </div>
      <div class="has-text-centered" v-if="filtered.length > shown">
        <button class="button is-light" @click="shown += 60">+ {{ filtered.length - shown }}</button>
      </div>
    </div>
  </section>
</template>
