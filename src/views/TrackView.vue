<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ref as dbRef, get } from 'firebase/database'
import { db } from '../firebase.js'
import { listenTracking, addComment, actorOf } from '../services/jobs.js'
import { normalizeCode, toArray } from '../services/util.js'
import { master, placeName } from '../stores/master.js'
import { authState, isStaff } from '../stores/auth.js'
import { ln, fmtDate } from '../i18n/index.js'
import { toastError } from '../stores/toast.js'
import StatusTag from '../components/StatusTag.vue'
import StatusSteps from '../components/StatusSteps.vue'
import HoldBanner from '../components/HoldBanner.vue'
import Timeline from '../components/Timeline.vue'
import PhotoGrid from '../components/PhotoGrid.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const input = ref('')
const data = ref(null)
const loading = ref(false)
const notFound = ref(false)
const ownJob = ref(null) // full job when the viewer is the reporter or staff
const comment = ref('')
const sending = ref(false)
const copied = ref(false)
let unsub = null

const code = computed(() => normalizeCode(route.params.code))
const timeline = computed(() => toArray(data.value?.timeline).sort((a, b) => (b.at || 0) - (a.at || 0)))

watch([code, () => authState.user], ([c]) => {
  if (unsub) { unsub(); unsub = null }
  data.value = null; notFound.value = false; ownJob.value = null
  if (!c) return
  input.value = c
  loading.value = true
  unsub = listenTracking(c, async (v) => {
    loading.value = false
    data.value = v; notFound.value = !v
    if (v && authState.user && !ownJob.value) {
      try { const s = await get(dbRef(db, `jobs/${v.jobId}`)); if (s.exists()) ownJob.value = { id: v.jobId, ...s.val() } } catch { /* not owner */ }
    }
  }, () => { loading.value = false; notFound.value = true })
}, { immediate: true })
onBeforeUnmount(() => unsub && unsub())

const lookup = () => { const c = normalizeCode(input.value); if (c) router.push('/t/' + c) }
async function send() {
  if (!comment.value.trim()) return
  sending.value = true
  try { await addComment(ownJob.value, comment.value.trim(), true, actorOf(authState)); comment.value = '' }
  catch (e) { toastError(e) } finally { sending.value = false }
}
async function share() {
  const url = location.origin + '/t/' + code.value
  try { if (navigator.share) await navigator.share({ title: data.value?.jobNo, url }); else { await navigator.clipboard.writeText(url); copied.value = true } } catch {}
}
</script>

<template>
  <section class="section">
    <div class="container" style="max-width:720px">
      <form @submit.prevent="lookup" class="field has-addons mb-4">
        <div class="control is-expanded"><input class="input tracking-code" style="font-size:1.05rem" v-model="input" :placeholder="$t('home.trackPlaceholder')" autocapitalize="characters" maxlength="12" /></div>
        <div class="control"><button class="button is-primary">{{ $t('track.lookup') }}</button></div>
      </form>

      <p v-if="loading" class="has-text-centered"><i class="mdi mdi-loading mdi-spin"></i> {{ $t('common.loading') }}</p>
      <div v-else-if="notFound" class="notification is-warning is-light">{{ $t('track.notFound') }}</div>

      <template v-if="data">
        <div class="box">
          <div class="is-flex is-justify-content-space-between is-align-items-start" style="gap:.5rem">
            <div>
              <p class="is-size-7 has-text-grey">{{ $t('request.jobNo') }}</p>
              <h1 class="title is-4 mb-1">{{ data.jobNo }}</h1>
              <p class="is-size-7 has-text-grey"><span class="tag is-success is-light is-small"><i class="mdi mdi-circle mdi-12px mr-1"></i>{{ $t('track.live') }}</span></p>
            </div>
            <StatusTag :status="data.status" size="is-medium" />
          </div>
          <StatusSteps :status="data.status" />
          <HoldBanner :status="data.status" :hold="data.hold" :expected-date="data.expectedDate" :expected-note="data.expectedNote" />

          <table class="table is-fullwidth is-narrow is-size-7 mb-2">
            <tbody>
              <tr><th>{{ $t('request.jobType') }}</th><td>{{ ln(master.jobTypes[data.jobTypeId]) }}</td></tr>
              <tr><th>{{ $t('jobs.location') }}</th><td>{{ placeName(data) }}</td></tr>
              <tr><th>{{ $t('track.reported') }}</th><td>{{ fmtDate(data.createdAt) }}</td></tr>
              <tr><th>{{ $t('track.updated') }}</th><td>{{ fmtDate(data.updatedAt) }}</td></tr>
            </tbody>
          </table>
          <div class="buttons">
            <button class="button is-small is-light" @click="share"><span class="icon"><i class="mdi mdi-share-variant"></i></span><span>{{ copied ? $t('common.copied') : $t('track.share') }}</span></button>
            <router-link v-if="isStaff" :to="'/jobs/' + data.jobId" class="button is-small is-primary is-light"><span class="icon"><i class="mdi mdi-open-in-app"></i></span><span>{{ $t('common.view') }}</span></router-link>
          </div>
        </div>

        <div class="box" v-if="ownJob">
          <h2 class="title is-6">{{ $t('jobs.detail') }}</h2>
          <p style="white-space:pre-line" class="mb-3">{{ ownJob.description }}</p>
          <PhotoGrid :job-id="ownJob.id" :photos="ownJob.photos" />
        </div>

        <div class="box">
          <h2 class="title is-6">{{ $t('track.timeline') }}</h2>
          <Timeline :events="timeline" />
          <form v-if="ownJob && !['completed','cancelled'].includes(data.status)" @submit.prevent="send" class="mt-3">
            <div class="field has-addons">
              <div class="control is-expanded"><input class="input" v-model="comment" :placeholder="$t('jobs.commentPh')" maxlength="1000" /></div>
              <div class="control"><button class="button is-primary" :class="{ 'is-loading': sending }"><i class="mdi mdi-send"></i></button></div>
            </div>
          </form>
        </div>
      </template>
    </div>
  </section>
</template>
