<script setup>
import { ref, computed, watch } from 'vue'
import QRCode from 'qrcode'
import { activeSites, activeBuildings, areasOf, buildingsOf } from '../../stores/master.js'
import { ln } from '../../i18n/index.js'

const sSel = ref('')
const bSel = ref('')
const doPrint = () => window.print()
const imgs = ref({})
const buildings = computed(() => buildingsOf(sSel.value, activeBuildings.value))
watch(buildings, (b) => { if (!b.some((x) => x.id === bSel.value)) bSel.value = b[0]?.id || '' }, { immediate: true })

const building = computed(() => activeBuildings.value.find((b) => b.id === bSel.value))
const items = computed(() => {
  if (!building.value) return []
  const b = building.value
  const base = `${location.origin}/request?b=${encodeURIComponent(b.code || b.id)}`
  return [{ key: b.id, title: ln(b), sub: '', url: base },
    ...areasOf(b.id).filter((a) => a.active !== false).map((a) => ({ key: a.id, title: ln(b), sub: ln(a), url: `${base}&a=${a.id}` }))]
})
watch(items, async (list) => {
  for (const it of list) {
    if (!imgs.value[it.url]) imgs.value[it.url] = await QRCode.toDataURL(it.url, { width: 512, margin: 1, color: { dark: '#582E91' } })
  }
}, { immediate: true })
</script>

<template>
  <section class="section">
    <div class="container">
      <div class="no-print">
        <h1 class="title is-4">{{ $t('qr.title') }}</h1>
        <p class="has-text-grey mb-3">{{ $t('qr.hint') }}</p>
        <div class="field is-grouped">
          <div class="control" v-if="activeSites.length > 1"><div class="select"><select v-model="sSel">
            <option value="">{{ $t('request.site') }}: {{ $t('common.all') }}</option>
            <option v-for="s in activeSites" :key="s.id" :value="s.id">{{ ln(s) }}</option></select></div></div>
          <div class="control"><div class="select"><select v-model="bSel">
            <option v-for="b in buildings" :key="b.id" :value="b.id">{{ ln(b) }}</option></select></div></div>
          <div class="control"><button class="button is-primary" @click="doPrint"><span class="icon"><i class="mdi mdi-printer"></i></span><span>{{ $t('common.print') }}</span></button></div>
        </div>
      </div>
      <div class="columns is-multiline is-mobile">
        <div v-for="it in items" :key="it.key" class="column is-6-mobile is-4-tablet is-3-desktop qr-card">
          <div class="box has-text-centered p-3" style="border-top:6px solid var(--vistec-purple)">
            <p class="has-text-weight-bold has-text-primary">{{ $t('app.name') }}</p>
            <p class="is-size-7 has-text-vistec-red has-text-weight-semibold mb-2">{{ $t('qr.scan') }}</p>
            <img v-if="imgs[it.url]" :src="imgs[it.url]" alt="QR" style="width:100%;max-width:220px" />
            <p class="has-text-weight-semibold is-size-7">{{ it.title }}</p>
            <p class="is-size-7">{{ it.sub || $t('qr.wholeBuilding') }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
