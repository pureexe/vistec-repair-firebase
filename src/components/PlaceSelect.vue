<script setup>
// Site → building → area pickers for staff forms (assets, PM plans). The site picker hides when there is one site.
import { computed, watch } from 'vue'
import { master, activeSites, activeBuildings, areasOf, buildingsOf } from '../stores/master.js'
import { ln } from '../i18n/index.js'

const site = defineModel('site', { default: '' })
const building = defineModel('building', { default: '' })
const area = defineModel('area', { default: '' })
defineProps({ required: Boolean })

const buildings = computed(() => buildingsOf(site.value, activeBuildings.value))
const areas = computed(() => (building.value ? areasOf(building.value).filter((a) => a.active !== false) : []))
watch(building, (b, old) => {
  if (old && b !== old) area.value = ''
  const s = master.buildings[b]?.siteId
  if (s) site.value = s
})
watch(site, (s) => { if (s && building.value && master.buildings[building.value]?.siteId !== s) building.value = '' })
watch(activeSites, (s) => { if (s.length === 1 && !site.value) site.value = s[0].id }, { immediate: true })
</script>

<template>
  <div class="columns is-mobile is-multiline mb-0">
    <div v-if="activeSites.length > 1" class="column is-12-mobile is-4-tablet">
      <label class="label is-small">{{ $t('request.site') }}</label>
      <div class="select is-small is-fullwidth"><select v-model="site">
        <option value="">{{ $t('request.selectPh') }}</option>
        <option v-for="s in activeSites" :key="s.id" :value="s.id">{{ ln(s) }}</option>
      </select></div>
    </div>
    <div class="column is-12-mobile" :class="activeSites.length > 1 ? 'is-4-tablet' : 'is-6-tablet'">
      <label class="label is-small">{{ $t('request.building') }}</label>
      <div class="select is-small is-fullwidth"><select v-model="building" :required="required">
        <option value="">{{ $t('request.selectPh') }}</option>
        <option v-for="b in buildings" :key="b.id" :value="b.id">{{ ln(b) }}</option>
      </select></div>
    </div>
    <div class="column is-12-mobile" :class="activeSites.length > 1 ? 'is-4-tablet' : 'is-6-tablet'">
      <label class="label is-small">{{ $t('request.area') }}</label>
      <div class="select is-small is-fullwidth"><select v-model="area" :disabled="!areas.length">
        <option value="">-</option>
        <option v-for="a in areas" :key="a.id" :value="a.id">{{ ln(a) }}</option>
      </select></div>
    </div>
  </div>
</template>
