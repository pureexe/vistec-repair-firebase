<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ref as dbRef, update } from 'firebase/database'
import { db } from '../firebase.js'
import { authState } from '../stores/auth.js'
import { master, activeBuildings, activeJobTypes, areasOf } from '../stores/master.js'
import { ln } from '../i18n/index.js'
import { getPosition, nearestBuilding, mapUrl } from '../services/geo.js'
import { createJob } from '../services/jobs.js'
import { PRIORITIES, MAX_PHOTOS } from '../services/util.js'
import { toastError } from '../stores/toast.js'
import PhotoPicker from '../components/PhotoPicker.vue'

const { t, locale } = useI18n()
const route = useRoute()

const form = reactive({
  buildingId: '', areaId: '', locationDetail: '', jobTypeId: '', description: '', priority: 'normal',
  name: '', phone: '', email: '', department: '', gps: null, pdpa: false
})
const images = ref([])
const busy = ref(false)
const err = ref('')
const done = ref(null)
const gpsState = ref('idle') // idle | loading | ok | denied
const gpsMsg = ref('')
const fromQr = ref('')
const copied = ref(false)

const areas = computed(() => (form.buildingId ? areasOf(form.buildingId).filter((a) => a.active !== false) : []))
watch(() => form.buildingId, (b, old) => { if (old && b !== old) form.areaId = '' })

function prefillContact() {
  const p = authState.profile || {}
  const u = authState.user || {}
  form.name ||= p.displayName || u.displayName || ''
  form.email ||= p.email || u.email || ''
  form.phone ||= p.phone || ''
  form.department ||= p.department || ''
}
watch(() => authState.profile, prefillContact, { immediate: true })

function applyQuery() {
  const b = route.query.b
  if (!b || !master.loaded) return
  const found = activeBuildings.value.find((x) => x.id === b || x.code === b)
  if (found) {
    form.buildingId = found.id
    const a = route.query.a && master.areas[route.query.a]
    if (a && a.buildingId === found.id) form.areaId = route.query.a
    fromQr.value = ln(found) + (a ? ' › ' + ln(a) : '')
  }
}
watch(() => master.loaded, applyQuery)

async function useGps() {
  gpsState.value = 'loading'
  try {
    const pos = await getPosition()
    form.gps = pos
    gpsState.value = 'ok'
    gpsMsg.value = t('request.gpsOk', { m: pos.accuracy })
    if (!fromQr.value) {
      const near = nearestBuilding(pos, activeBuildings.value)
      if (near && near.distance < 3000) {
        form.buildingId = near.building.id
        gpsMsg.value += ' — ' + t('request.gpsNearest', { name: ln(near.building), m: near.distance })
      }
    }
  } catch (e) {
    gpsState.value = 'denied'
    gpsMsg.value = t('request.gpsDenied')
  }
}

onMounted(() => {
  applyQuery()
  // Pre-fill location from the phone GPS (skip if the QR code already told us where we are)
  if (!route.query.b) useGps()
})

async function submit() {
  err.value = ''
  if (!form.buildingId || !form.jobTypeId || !form.description.trim() || !form.name.trim() || !form.phone.trim() || !form.email.trim()) {
    err.value = t('err.required'); return
  }
  if (!form.pdpa) { err.value = t('err.pdpa'); return }
  busy.value = true
  try {
    const res = await createJob({ ...form, lang: locale.value }, images.value, authState.user)
    // remember contact details for next time
    const p = authState.profile || {}
    const patch = {}
    if (!p.phone) patch.phone = form.phone
    if (!p.department && form.department) patch.department = form.department
    if (!p.displayName) patch.displayName = form.name
    if (Object.keys(patch).length) update(dbRef(db, `users/${authState.user.uid}`), patch).catch(() => {})
    done.value = res
    window.scrollTo(0, 0)
  } catch (e) { toastError(e) } finally { busy.value = false }
}

function reset() {
  Object.assign(form, { areaId: '', locationDetail: '', jobTypeId: '', description: '', priority: 'normal', pdpa: false })
  images.value = []; done.value = null
}
const trackUrl = computed(() => done.value ? `${location.origin}/t/${done.value.trackingCode}` : '')
async function copy() { try { await navigator.clipboard.writeText(trackUrl.value); copied.value = true; setTimeout(() => (copied.value = false), 2000) } catch {} }
</script>

<template>
  <section class="section">
    <div class="container" style="max-width:720px">
      <!-- Success -->
      <div v-if="done" class="box has-text-centered">
        <span class="icon is-large has-text-success"><i class="mdi mdi-check-circle mdi-48px"></i></span>
        <h1 class="title is-4 mt-3">{{ $t('request.successTitle') }}</h1>
        <p class="mb-4">{{ $t('request.successText') }}</p>
        <p class="is-size-7 has-text-grey">{{ $t('request.trackingCode') }}</p>
        <p class="tracking-code mb-2">{{ done.trackingCode }}</p>
        <p class="is-size-7 has-text-grey mb-4">{{ $t('request.jobNo') }}: {{ done.jobNo }}</p>
        <div class="buttons is-centered is-stacked-mobile">
          <router-link :to="'/t/' + done.trackingCode" class="button is-primary"><span class="icon"><i class="mdi mdi-magnify"></i></span><span>{{ $t('request.openTracking') }}</span></router-link>
          <button class="button" @click="copy"><span class="icon"><i class="mdi mdi-content-copy"></i></span><span>{{ copied ? $t('common.copied') : $t('track.share') }}</span></button>
          <button class="button is-light" @click="reset">{{ $t('request.another') }}</button>
        </div>
      </div>

      <!-- Form -->
      <form v-else @submit.prevent="submit" class="box">
        <h1 class="title is-4 mb-1">{{ $t('request.title') }}</h1>
        <div class="accent-bar mb-4"></div>

        <div v-if="fromQr" class="notification is-primary is-light py-2"><i class="mdi mdi-qrcode"></i> {{ $t('request.fromQr', { name: fromQr }) }}</div>

        <!-- GPS -->
        <div class="field">
          <label class="label">{{ $t('request.gps') }}</label>
          <div class="is-flex is-align-items-center is-flex-wrap-wrap" style="gap:.5rem">
            <button type="button" class="button is-small is-primary is-light" :class="{ 'is-loading': gpsState === 'loading' }" @click="useGps">
              <span class="icon"><i class="mdi mdi-crosshairs-gps"></i></span><span>{{ $t('request.gpsUse') }}</span>
            </button>
            <span class="is-size-7" :class="gpsState === 'denied' ? 'has-text-danger' : 'has-text-success'">{{ gpsState === 'loading' ? $t('request.gpsLoading') : gpsMsg }}</span>
            <a v-if="form.gps" :href="mapUrl(form.gps)" target="_blank" rel="noopener" class="is-size-7"><i class="mdi mdi-map"></i> {{ $t('request.gpsMap') }}</a>
          </div>
        </div>

        <div class="columns is-mobile is-multiline">
          <div class="column is-12-mobile is-6-tablet">
            <div class="field">
              <label class="label">{{ $t('request.building') }} *</label>
              <div class="control"><div class="select is-fullwidth">
                <select v-model="form.buildingId" required>
                  <option value="" disabled>{{ $t('request.selectPh') }}</option>
                  <option v-for="b in activeBuildings" :key="b.id" :value="b.id">{{ ln(b) }}</option>
                </select>
              </div></div>
            </div>
          </div>
          <div class="column is-12-mobile is-6-tablet">
            <div class="field">
              <label class="label">{{ $t('request.area') }}</label>
              <div class="control"><div class="select is-fullwidth">
                <select v-model="form.areaId" :disabled="!areas.length">
                  <option value="">{{ $t('request.selectPh') }}</option>
                  <option v-for="a in areas" :key="a.id" :value="a.id">{{ ln(a) }}</option>
                </select>
              </div></div>
            </div>
          </div>
        </div>
        <div class="field">
          <label class="label">{{ $t('request.locationDetail') }}</label>
          <input class="input" v-model="form.locationDetail" :placeholder="$t('request.locationDetailPh')" maxlength="200" />
        </div>

        <div class="field">
          <label class="label">{{ $t('request.jobType') }} *</label>
          <div class="buttons">
            <button v-for="jt in activeJobTypes" :key="jt.id" type="button" class="button"
              :class="form.jobTypeId === jt.id ? 'is-primary' : 'is-light'" @click="form.jobTypeId = jt.id">
              <span class="icon"><i class="mdi" :class="jt.icon || 'mdi-wrench'"></i></span><span>{{ ln(jt) }}</span>
            </button>
          </div>
        </div>

        <div class="field">
          <label class="label">{{ $t('request.description') }} *</label>
          <textarea class="textarea" v-model="form.description" :placeholder="$t('request.descriptionPh')" rows="4" maxlength="3000" required></textarea>
        </div>

        <div class="field">
          <label class="label">{{ $t('request.priority') }}</label>
          <div class="select is-fullwidth"><select v-model="form.priority">
            <option v-for="p in PRIORITIES" :key="p" :value="p">{{ $t('priority.' + p) }}</option>
          </select></div>
        </div>

        <div class="field">
          <label class="label">{{ $t('request.photos', { n: MAX_PHOTOS }) }}</label>
          <PhotoPicker v-model="images" :max="MAX_PHOTOS" />
          <p class="help">{{ $t('request.photosHint') }}</p>
        </div>

        <h2 class="title is-6 mt-5 mb-3"><i class="mdi mdi-card-account-phone"></i> {{ $t('request.contact') }}</h2>
        <div class="columns is-multiline">
          <div class="column is-6"><div class="field"><label class="label">{{ $t('request.name') }} *</label><input class="input" v-model="form.name" required maxlength="120" autocomplete="name" /></div></div>
          <div class="column is-6"><div class="field"><label class="label">{{ $t('request.phone') }} *</label><input class="input" type="tel" v-model="form.phone" required maxlength="40" autocomplete="tel" inputmode="tel" /></div></div>
          <div class="column is-6"><div class="field"><label class="label">{{ $t('request.email') }} *</label><input class="input" type="email" v-model="form.email" required maxlength="160" autocomplete="email" /></div></div>
          <div class="column is-6"><div class="field"><label class="label">{{ $t('request.department') }}</label><input class="input" v-model="form.department" maxlength="120" /></div></div>
        </div>

        <div class="field">
          <label class="checkbox"><input type="checkbox" v-model="form.pdpa" /> {{ $t('request.pdpa') }}</label>
        </div>

        <div v-if="err" class="notification is-danger is-light">{{ err }}</div>
        <button class="button is-primary is-medium is-fullwidth" :class="{ 'is-loading': busy }" :disabled="busy">
          <span class="icon"><i class="mdi mdi-send"></i></span><span>{{ $t('request.submit') }}</span>
        </button>
      </form>
    </div>
  </section>
</template>
