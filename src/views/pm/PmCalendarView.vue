<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { master, activeSites, activeBuildings, buildingsOf } from '../../stores/master.js'
import { inv, startInventory, planList } from '../../stores/inventory.js'
import { occurrences } from '../../services/pmSchedule.js'
import { ln } from '../../i18n/index.js'

const { locale } = useI18n()
startInventory()
const site = ref('')
const building = ref('')
const buildings = computed(() => buildingsOf(site.value, activeBuildings.value))
const cursor = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const move = (n) => { const d = new Date(cursor.value); d.setMonth(d.getMonth() + n); cursor.value = d }
const today = () => { cursor.value = new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
const loc = computed(() => (locale.value === 'en' ? 'en-GB' : 'th-TH'))
const monthTitle = computed(() => cursor.value.toLocaleDateString(loc.value, { month: 'long', year: 'numeric' }))
const weekdays = computed(() => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, i + 1).toLocaleDateString(loc.value, { weekday: 'short' }))) // 1 Jan 2024 = Monday

// one colour per building (the "building calendar" of CPFM)
const COLORS = ['#582E91', '#A0223A', '#1f7a8c', '#c77d00', '#2b8a3e', '#5c7cfa', '#d6336c', '#495057']
const colorOf = (bId) => COLORS[Math.max(0, activeBuildings.value.findIndex((b) => b.id === bId)) % COLORS.length]

const events = computed(() => {
  const from = cursor.value.getTime()
  const to = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + 1, 1).getTime() - 1
  return planList.value
    .filter((p) => p.active !== false && (!site.value || (p.siteId || master.buildings[p.buildingId]?.siteId) === site.value) && (!building.value || p.buildingId === building.value))
    .flatMap((p) => occurrences(p, from, to, 400).map((at) => ({ plan: p, at, jobId: p.jobs?.[at] })))
    .sort((a, b) => a.at - b.at)
})
const byDay = computed(() => {
  const m = {}
  for (const e of events.value) (m[new Date(e.at).getDate()] ||= []).push(e)
  return m
})
// Monday-first grid with blanks before day 1
const cells = computed(() => {
  const first = (cursor.value.getDay() + 6) % 7
  const days = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + 1, 0).getDate()
  return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
})
const isToday = (d) => { const n = new Date(); return d && n.getFullYear() === cursor.value.getFullYear() && n.getMonth() === cursor.value.getMonth() && n.getDate() === d }
const hm = (ms) => new Date(ms).toLocaleTimeString(loc.value, { hour: '2-digit', minute: '2-digit' })
const dayTitle = (d) => new Date(cursor.value.getFullYear(), cursor.value.getMonth(), d).toLocaleDateString(loc.value, { weekday: 'long', day: 'numeric', month: 'short' })
</script>

<template>
  <section class="section">
    <div class="container">
      <router-link to="/pm" class="is-size-7"><i class="mdi mdi-arrow-left"></i> {{ $t('pm.title') }}</router-link>
      <div class="is-flex is-justify-content-space-between is-align-items-center mt-2 mb-3 is-flex-wrap-wrap" style="gap:.5rem">
        <h1 class="title is-4 mb-0">{{ $t('nav.pmCalendar') }}</h1>
        <div class="buttons has-addons mb-0">
          <button class="button is-small" @click="move(-1)"><i class="mdi mdi-chevron-left"></i></button>
          <button class="button is-small" @click="today">{{ $t('pm.today') }}</button>
          <button class="button is-small" @click="move(1)"><i class="mdi mdi-chevron-right"></i></button>
        </div>
      </div>
      <div class="columns is-mobile is-multiline mb-1">
        <div class="column is-12-mobile is-4-tablet"><p class="title is-5 mb-0">{{ monthTitle }}</p></div>
        <div class="column is-6-mobile is-3-tablet" v-if="activeSites.length > 1">
          <div class="select is-fullwidth is-small"><select v-model="site" @change="building = ''">
            <option value="">{{ $t('request.site') }}: {{ $t('common.all') }}</option><option v-for="s in activeSites" :key="s.id" :value="s.id">{{ ln(s) }}</option></select></div>
        </div>
        <div class="column is-6-mobile is-3-tablet">
          <div class="select is-fullwidth is-small"><select v-model="building">
            <option value="">{{ $t('request.building') }}: {{ $t('common.all') }}</option><option v-for="b in buildings" :key="b.id" :value="b.id">{{ ln(b) }}</option></select></div>
        </div>
      </div>
      <p v-if="!inv.loaded"><i class="mdi mdi-loading mdi-spin"></i> {{ $t('common.loading') }}</p>

      <!-- tablet / desktop: month grid -->
      <div class="pm-cal is-hidden-mobile">
        <div v-for="w in weekdays" :key="w" class="pm-cal-head">{{ w }}</div>
        <div v-for="(d, i) in cells" :key="i" class="pm-cal-day" :class="{ 'is-empty': !d, 'is-today': isToday(d) }">
          <template v-if="d">
            <div class="is-size-7 has-text-weight-bold mb-1">{{ d }}</div>
            <router-link v-for="e in byDay[d] || []" :key="e.plan.id + e.at" :to="e.jobId ? '/jobs/' + e.jobId : '/pm/' + e.plan.id"
              class="pm-chip" :style="{ background: colorOf(e.plan.buildingId) }" :title="e.plan.code + ' ' + e.plan.title">
              <i v-if="e.jobId" class="mdi mdi-check"></i> {{ hm(e.at) }} {{ e.plan.title }}
            </router-link>
          </template>
        </div>
      </div>

      <!-- phone: list by day -->
      <div class="is-hidden-tablet">
        <p v-if="inv.loaded && !events.length" class="has-text-grey">{{ $t('common.noData') }}</p>
        <div v-for="(list, d) in byDay" :key="d" class="mb-3">
          <p class="has-text-weight-bold is-size-7 mb-1" :class="{ 'has-text-primary': isToday(Number(d)) }">{{ dayTitle(Number(d)) }}</p>
          <router-link v-for="e in list" :key="e.plan.id + e.at" :to="e.jobId ? '/jobs/' + e.jobId : '/pm/' + e.plan.id" class="box p-3 mb-2 is-block has-text-dark" :style="{ borderLeft: '4px solid ' + colorOf(e.plan.buildingId) }">
            <p class="is-size-7"><strong>{{ hm(e.at) }}</strong> {{ e.plan.code }} <span v-if="e.jobId" class="tag is-success is-light ml-1"><i class="mdi mdi-check"></i></span></p>
            <p>{{ e.plan.title }}</p>
            <p class="is-size-7 has-text-grey">{{ ln(master.buildings[e.plan.buildingId]) }}</p>
          </router-link>
        </div>
      </div>

      <div class="tags mt-3">
        <span v-for="b in buildings.filter((b) => planList.some((p) => p.buildingId === b.id))" :key="b.id" class="tag" :style="{ background: colorOf(b.id), color: '#fff' }">{{ ln(b) }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pm-cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; background: #e8e5ee; border-radius: .5rem; overflow: hidden; }
.pm-cal-head { background: var(--vistec-purple-soft); text-align: center; font-size: .75rem; font-weight: 600; padding: .35rem 0; }
.pm-cal-day { background: #fff; min-height: 6.5rem; padding: .35rem; }
.pm-cal-day.is-empty { background: #faf9fc; }
.pm-cal-day.is-today { box-shadow: inset 0 0 0 2px var(--vistec-purple); }
.pm-chip { display: block; color: #fff; font-size: .7rem; border-radius: .25rem; padding: 0 .3rem; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pm-chip:hover { color: #fff; opacity: .85; }
</style>
