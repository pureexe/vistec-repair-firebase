<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { authState, isTech } from '../stores/auth.js'
import { listenJobsPage, listenAssignedJobs, findJobs, JOBS_PAGE } from '../services/jobs.js'
import { activeSites, activeBuildings, buildingsOf, master } from '../stores/master.js'
import { ln } from '../i18n/index.js'
import { STATUSES, OPEN_STATUSES } from '../services/util.js'
import { toastError } from '../stores/toast.js'
import JobCard from '../components/JobCard.vue'

const status = ref('open') // 'open' | 'all' | a status
const site = ref('')
const building = ref('')
const buildings = computed(() => buildingsOf(site.value, activeBuildings.value))
const q = ref('')
const mine = ref(false)
const found = ref(null) // result of a job-number / tracking-code search, null = not searching

// Staff browse every job page by page (the database does the filtering). Contractors and
// "assigned to me" load their own — short — list in one go and filter here.
const paged = computed(() => isTech.value && !mine.value)

/* ---------- paged mode ---------- */
const page = ref(null) // { jobs, next }
const cursors = ref([null]) // cursor of every page visited, so "previous" works
let unsubPage = () => {}
function loadPage() {
  unsubPage()
  page.value = null
  if (!paged.value) return
  unsubPage = listenJobsPage({ site: site.value, building: building.value, status: status.value }, cursors.value.at(-1),
    (p) => (page.value = p), (e) => { toastError(e); page.value = { jobs: [], next: null } })
}
function restart() { cursors.value = [null]; found.value = null; loadPage() }
watch([status, site, building, paged], restart, { immediate: true })
const nextPage = () => { cursors.value.push(page.value.next); loadPage(); window.scrollTo(0, 0) }
const prevPage = () => { cursors.value.pop(); loadPage(); window.scrollTo(0, 0) }

/* ---------- full-list mode ---------- */
const own = ref(null)
let unsubOwn = () => {}
watch(paged, (p) => {
  unsubOwn()
  if (p) return
  own.value = null
  unsubOwn = listenAssignedJobs(authState.user.uid, (j) => (own.value = j), (e) => { toastError(e); own.value = [] })
}, { immediate: true })
onBeforeUnmount(() => { unsubPage(); unsubOwn() })

const ownCounts = computed(() => {
  const c = { open: 0, all: 0 }
  for (const j of own.value || []) { c.all++; c[j.status] = (c[j.status] || 0) + 1; if (OPEN_STATUSES.includes(j.status)) c.open++ }
  return c
})
const ownFiltered = computed(() => (own.value || []).filter((j) => {
  if (status.value === 'open' && !OPEN_STATUSES.includes(j.status)) return false
  if (!['open', 'all'].includes(status.value) && j.status !== status.value) return false
  if (site.value && (j.siteId || master.buildings[j.buildingId]?.siteId) !== site.value) return false
  if (building.value && j.buildingId !== building.value) return false
  return true
}))

/* ---------- search ---------- */
// Enter: exact job number / tracking code over all jobs. Typing: narrows the jobs on screen.
async function search() {
  if (!q.value.trim()) { found.value = null; return }
  try { found.value = await findJobs(q.value) } catch (e) { toastError(e) }
}
const textMatch = (j) => {
  const s = q.value.trim().toLowerCase()
  if (!s) return true
  const hay = [j.jobNo, j.trackingCode, j.description, j.reporter?.name, j.reporter?.email, j.assigneeName, j.locationDetail, ln(master.jobTypes[j.jobTypeId])].join(' ').toLowerCase()
  return hay.includes(s)
}

const loading = computed(() => (found.value ? false : paged.value ? page.value === null : own.value === null))
const shown = computed(() => {
  if (found.value) return found.value
  return (paged.value ? page.value?.jobs || [] : ownFiltered.value).filter(textMatch)
})
const pageNo = computed(() => cursors.value.length)
</script>

<template>
  <section class="section">
    <div class="container">
      <div class="is-flex is-justify-content-space-between is-align-items-center mb-3" style="gap:.5rem">
        <h1 class="title is-4 mb-0">{{ isTech ? $t('jobs.title') : $t('jobs.assignedToMe') }}</h1>
        <span v-if="!paged" class="tag is-light">{{ $t('jobs.count', { n: shown.length }) }}</span>
      </div>

      <div class="tabs is-small is-toggle mb-3" style="overflow-x:auto">
        <ul>
          <li :class="{ 'is-active': status === 'open' }"><a @click="status = 'open'">{{ $t('jobs.openOnly') }}<template v-if="!paged"> ({{ ownCounts.open }})</template></a></li>
          <li v-for="s in STATUSES" :key="s" :class="{ 'is-active': status === s }"><a @click="status = s">{{ $t('status.' + s) }}<template v-if="!paged"> ({{ ownCounts[s] || 0 }})</template></a></li>
          <li :class="{ 'is-active': status === 'all' }"><a @click="status = 'all'">{{ $t('common.all') }}<template v-if="!paged"> ({{ ownCounts.all }})</template></a></li>
        </ul>
      </div>

      <div class="columns is-mobile is-multiline mb-1">
        <div class="column is-12-mobile is-4-tablet">
          <form @submit.prevent="search">
            <p class="control has-icons-left"><input class="input" v-model="q" :placeholder="$t('jobs.searchPh')" @input="!q && (found = null)" /><span class="icon is-left"><i class="mdi mdi-magnify"></i></span></p>
            <p class="help">{{ $t('jobs.searchHelp') }}</p>
          </form>
        </div>
        <div class="column is-6-mobile is-3-tablet" v-if="activeSites.length > 1">
          <div class="select is-fullwidth"><select v-model="site" @change="building = ''">
            <option value="">{{ $t('request.site') }}: {{ $t('common.all') }}</option>
            <option v-for="s in activeSites" :key="s.id" :value="s.id">{{ ln(s) }}</option>
          </select></div>
        </div>
        <div class="column is-6-mobile is-3-tablet">
          <div class="select is-fullwidth"><select v-model="building">
            <option value="">{{ $t('request.building') }}: {{ $t('common.all') }}</option>
            <option v-for="b in buildings" :key="b.id" :value="b.id">{{ ln(b) }}</option>
          </select></div>
        </div>
        <div class="column is-12-mobile is-2-tablet is-flex is-align-items-center" v-if="isTech">
          <label class="checkbox is-size-7"><input type="checkbox" v-model="mine" /> {{ $t('jobs.assignedToMe') }}</label>
        </div>
      </div>

      <div v-if="found" class="notification is-primary is-light py-2">
        {{ $t('jobs.searchResult', { n: found.length }) }} <a @click="found = null; q = ''">{{ $t('common.clear') }}</a>
      </div>

      <p v-if="loading"><i class="mdi mdi-loading mdi-spin"></i> {{ $t('common.loading') }}</p>
      <p v-else-if="!shown.length" class="has-text-grey">{{ $t('jobs.empty') }}</p>
      <div class="columns is-multiline">
        <div class="column is-6-tablet is-4-widescreen" v-for="j in shown" :key="j.id">
          <router-link :to="'/jobs/' + j.id" class="has-text-dark"><JobCard :job="j" show-reporter /></router-link>
        </div>
      </div>

      <nav v-if="paged && !found && page && (pageNo > 1 || page.next)" class="is-flex is-justify-content-center is-align-items-center mt-3" style="gap:.75rem">
        <button class="button" :disabled="pageNo <= 1" @click="prevPage"><span class="icon"><i class="mdi mdi-chevron-left"></i></span><span>{{ $t('common.prev') }}</span></button>
        <span class="is-size-7 has-text-grey">{{ $t('jobs.page', { n: pageNo, size: JOBS_PAGE }) }}</span>
        <button class="button" :disabled="!page.next" @click="nextPage"><span>{{ $t('common.next') }}</span><span class="icon"><i class="mdi mdi-chevron-right"></i></span></button>
      </nav>
    </div>
  </section>
</template>
