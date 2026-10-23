<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { listenAllJobs } from '../services/jobs.js'
import { master } from '../stores/master.js'
import { ln } from '../i18n/index.js'
import { STATUSES, OPEN_STATUSES } from '../services/util.js'
import StatusTag from '../components/StatusTag.vue'

const { t, locale } = useI18n()
const jobs = ref([])
const unsub = listenAllJobs((j) => (jobs.value = j), 5000)
onBeforeUnmount(unsub)

const monthKey = (ms) => { const d = new Date(ms); return d.getFullYear() * 12 + d.getMonth() }
const now = new Date()
const thisM = now.getFullYear() * 12 + now.getMonth()

function kpi(list) {
  const done = list.filter((j) => j.status === 'completed').length
  return { n: list.length, p: list.length ? Math.round((done / list.length) * 100) : 0 }
}
const stats = computed(() => {
  const all = jobs.value
  return {
    thisMonth: kpi(all.filter((j) => monthKey(j.createdAt) === thisM)),
    lastMonth: kpi(all.filter((j) => monthKey(j.createdAt) === thisM - 1)),
    total: kpi(all),
    open: all.filter((j) => OPEN_STATUSES.includes(j.status)).length,
    onHold: all.filter((j) => j.status === 'on_hold'),
    overdue: all.filter((j) => OPEN_STATUSES.includes(j.status) && j.expectedDate && j.expectedDate < Date.now())
  }
})

function groupBy(fn, labelFn) {
  const m = {}
  for (const j of jobs.value) { const k = fn(j) || '-'; m[k] = (m[k] || 0) + 1 }
  const rows = Object.entries(m).map(([k, v]) => ({ k, label: labelFn(k), v })).sort((a, b) => b.v - a.v)
  const max = Math.max(1, ...rows.map((r) => r.v))
  return rows.map((r) => ({ ...r, pct: (r.v / max) * 100 }))
}
const byStatus = computed(() => STATUSES.map((s) => ({ s, v: jobs.value.filter((j) => j.status === s).length })))
const byType = computed(() => groupBy((j) => j.jobTypeId, (k) => ln(master.jobTypes[k]) || '-').slice(0, 10))
const byBuilding = computed(() => groupBy((j) => j.buildingId, (k) => ln(master.buildings[k]) || '-').slice(0, 10))
const byAssignee = computed(() => groupBy((j) => j.assigneeName, (k) => (k === '-' ? t('jobs.unassigned') : k)).slice(0, 10))
const byMonth = computed(() => {
  const rows = []
  for (let i = 11; i >= 0; i--) {
    const k = thisM - i
    const d = new Date(Math.floor(k / 12), k % 12, 1)
    const list = jobs.value.filter((j) => monthKey(j.createdAt) === k)
    rows.push({ label: d.toLocaleDateString(locale.value === 'en' ? 'en-GB' : 'th-TH', { month: 'short' }), v: list.length, done: list.filter((j) => j.status === 'completed').length })
  }
  const max = Math.max(1, ...rows.map((r) => r.v))
  return rows.map((r) => ({ ...r, h: (r.v / max) * 100, hd: (r.done / max) * 100 }))
})
</script>

<template>
  <section class="section">
    <div class="container">
      <h1 class="title is-4">{{ $t('dashboard.title') }}</h1>
      <div class="columns is-mobile is-multiline">
        <div class="column is-6-mobile is-3-tablet"><div class="box kpi"><div class="num">{{ stats.thisMonth.n }}</div><div class="lbl">{{ $t('dashboard.thisMonth') }} · {{ $t('dashboard.done', { p: stats.thisMonth.p }) }}</div></div></div>
        <div class="column is-6-mobile is-3-tablet"><div class="box kpi"><div class="num">{{ stats.lastMonth.n }}</div><div class="lbl">{{ $t('dashboard.lastMonth') }} · {{ $t('dashboard.done', { p: stats.lastMonth.p }) }}</div></div></div>
        <div class="column is-6-mobile is-3-tablet"><div class="box kpi"><div class="num">{{ stats.total.n }}</div><div class="lbl">{{ $t('dashboard.total') }} · {{ $t('dashboard.done', { p: stats.total.p }) }}</div></div></div>
        <div class="column is-6-mobile is-3-tablet"><div class="box kpi"><div class="num has-text-vistec-red">{{ stats.open }}</div><div class="lbl">{{ $t('dashboard.open') }}</div></div></div>
      </div>

      <div class="columns is-multiline">
        <div class="column is-8">
          <div class="box">
            <h2 class="title is-6">{{ $t('dashboard.byMonth') }}</h2>
            <div style="display:flex;align-items:flex-end;gap:4px;height:160px">
              <div v-for="m in byMonth" :key="m.label" style="flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end">
                <span class="is-size-7">{{ m.v || '' }}</span>
                <div style="width:100%;position:relative;border-radius:4px 4px 0 0;background:#d9cdea" :style="{ height: m.h + '%' }" :title="`${m.v} / ${m.done}`">
                  <div style="position:absolute;bottom:0;left:0;right:0;background:var(--vistec-purple);border-radius:4px 4px 0 0" :style="{ height: (m.v ? (m.done / m.v) * 100 : 0) + '%' }"></div>
                </div>
              </div>
            </div>
            <div style="display:flex;gap:4px" class="is-size-7 has-text-grey mt-1"><span v-for="m in byMonth" :key="m.label" style="flex:1;text-align:center">{{ m.label }}</span></div>
            <p class="is-size-7 mt-2"><span class="tag" style="background:#d9cdea">{{ $t('status.new') }}</span> <span class="tag is-primary">{{ $t('status.completed') }}</span></p>
          </div>
        </div>
        <div class="column is-4">
          <div class="box">
            <h2 class="title is-6">{{ $t('dashboard.byStatus') }}</h2>
            <div v-for="s in byStatus" :key="s.s" class="is-flex is-justify-content-space-between mb-2"><StatusTag :status="s.s" /><strong>{{ s.v }}</strong></div>
          </div>
        </div>
        <div class="column is-4" v-for="[title, rows] in [['dashboard.byType', byType], ['dashboard.byBuilding', byBuilding], ['dashboard.byAssignee', byAssignee]]" :key="title">
          <div class="box" style="height:100%">
            <h2 class="title is-6">{{ $t(title) }}</h2>
            <p v-if="!rows.length" class="has-text-grey is-size-7">{{ $t('common.noData') }}</p>
            <div v-for="r in rows" :key="r.k" class="bar-row"><span class="lbl" :title="r.label">{{ r.label }}</span><span class="bar"><span :style="{ width: r.pct + '%' }"></span></span><span class="val">{{ r.v }}</span></div>
          </div>
        </div>
        <div class="column is-6">
          <div class="box"><h2 class="title is-6 has-text-vistec-red">{{ $t('dashboard.onHold') }} ({{ stats.onHold.length }})</h2>
            <router-link v-for="j in stats.onHold.slice(0, 10)" :key="j.id" :to="'/jobs/' + j.id" class="is-block is-size-7 mb-1">{{ j.jobNo }} · {{ $t('hold.' + (j.hold?.reason || 'other')) }}</router-link></div>
        </div>
        <div class="column is-6">
          <div class="box"><h2 class="title is-6 has-text-vistec-red">{{ $t('dashboard.overdue') }} ({{ stats.overdue.length }})</h2>
            <router-link v-for="j in stats.overdue.slice(0, 10)" :key="j.id" :to="'/jobs/' + j.id" class="is-block is-size-7 mb-1">{{ j.jobNo }} · {{ j.assigneeName || $t('jobs.unassigned') }}</router-link></div>
        </div>
      </div>
    </div>
  </section>
</template>
