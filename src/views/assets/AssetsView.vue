<script setup>
import { ref, computed } from 'vue'
import { isTech } from '../../stores/auth.js'
import { master, activeSites, activeBuildings, buildingsOf, placeName } from '../../stores/master.js'
import { inv, startInventory, assetList, assetGroups, typeName } from '../../stores/inventory.js'
import { ASSET_STATUSES, assetStatusColor } from '../../services/inventory.js'
import { ln } from '../../i18n/index.js'

startInventory()
const q = ref('')
const site = ref('')
const building = ref('')
const group = ref('')
const status = ref('')
const buildings = computed(() => buildingsOf(site.value, activeBuildings.value))

const shown = computed(() => {
  const s = q.value.trim().toLowerCase()
  return assetList.value.filter((a) => {
    if (site.value && (a.siteId || master.buildings[a.buildingId]?.siteId) !== site.value) return false
    if (building.value && a.buildingId !== building.value) return false
    if (group.value && a.typeId !== group.value && inv.assetTypes[a.typeId]?.parentId !== group.value) return false
    if (status.value && (a.status || 'normal') !== status.value) return false
    if (!s) return true
    return [a.code, a.name, a.brand, a.model, a.serial, a.detail, a.locationDetail, typeName(a.typeId)].join(' ').toLowerCase().includes(s)
  })
})
</script>

<template>
  <section class="section">
    <div class="container">
      <div class="is-flex is-justify-content-space-between is-align-items-center mb-3" style="gap:.5rem">
        <h1 class="title is-4 mb-0">{{ $t('asset.title') }}</h1>
        <div class="is-flex is-align-items-center" style="gap:.5rem">
          <span class="tag is-light">{{ $t('asset.count', { n: shown.length }) }}</span>
          <router-link v-if="isTech" to="/assets/new" class="button is-primary is-small"><span class="icon"><i class="mdi mdi-plus"></i></span><span>{{ $t('asset.add') }}</span></router-link>
        </div>
      </div>

      <div class="columns is-mobile is-multiline mb-1">
        <div class="column is-12-mobile is-4-tablet">
          <p class="control has-icons-left"><input class="input" v-model="q" :placeholder="$t('asset.searchPh')" /><span class="icon is-left"><i class="mdi mdi-magnify"></i></span></p>
        </div>
        <div class="column is-6-mobile is-2-tablet" v-if="activeSites.length > 1">
          <div class="select is-fullwidth"><select v-model="site" @change="building = ''">
            <option value="">{{ $t('request.site') }}: {{ $t('common.all') }}</option>
            <option v-for="s in activeSites" :key="s.id" :value="s.id">{{ ln(s) }}</option>
          </select></div>
        </div>
        <div class="column is-6-mobile is-2-tablet">
          <div class="select is-fullwidth"><select v-model="building">
            <option value="">{{ $t('request.building') }}: {{ $t('common.all') }}</option>
            <option v-for="b in buildings" :key="b.id" :value="b.id">{{ ln(b) }}</option>
          </select></div>
        </div>
        <div class="column is-6-mobile is-2-tablet">
          <div class="select is-fullwidth"><select v-model="group">
            <option value="">{{ $t('asset.group') }}: {{ $t('common.all') }}</option>
            <option v-for="g in assetGroups" :key="g.id" :value="g.id">{{ ln(g) }}</option>
          </select></div>
        </div>
        <div class="column is-6-mobile is-2-tablet">
          <div class="select is-fullwidth"><select v-model="status">
            <option value="">{{ $t('asset.status') }}: {{ $t('common.all') }}</option>
            <option v-for="s in ASSET_STATUSES" :key="s" :value="s">{{ $t('assetStatus.' + s) }}</option>
          </select></div>
        </div>
      </div>

      <p v-if="!inv.loaded"><i class="mdi mdi-loading mdi-spin"></i> {{ $t('common.loading') }}</p>
      <p v-else-if="!shown.length" class="has-text-grey">{{ $t('common.noData') }}</p>
      <div class="columns is-multiline">
        <div class="column is-6-tablet is-4-widescreen" v-for="a in shown.slice(0, 300)" :key="a.id">
          <router-link :to="'/assets/' + a.id" class="has-text-dark">
            <div class="card is-clickable" style="height:100%">
              <div class="card-content p-4">
                <div class="is-flex is-justify-content-space-between is-align-items-start mb-1" style="gap:.5rem">
                  <p class="has-text-weight-bold is-size-7" style="word-break:break-all"><i class="mdi mdi-cog has-text-primary"></i> {{ a.code }}</p>
                  <span class="tag is-light" :class="assetStatusColor[a.status || 'normal']">{{ $t('assetStatus.' + (a.status || 'normal')) }}</span>
                </div>
                <p class="mb-1" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">{{ a.name }}</p>
                <p class="is-size-7 has-text-grey">{{ typeName(a.typeId) }}</p>
                <p class="is-size-7 has-text-grey"><i class="mdi mdi-map-marker"></i> {{ placeName(a) || '-' }}</p>
                <p class="is-size-7 mt-1">
                  <span v-if="a.pm" class="tag is-primary is-light mr-1">PM</span>
                  <span v-if="a.qm" class="tag is-link is-light mr-1">QM</span>
                  <span v-if="a.brand || a.model" class="has-text-grey">{{ [a.brand, a.model].filter(Boolean).join(' · ') }}</span>
                </p>
              </div>
            </div>
          </router-link>
        </div>
      </div>
      <p v-if="shown.length > 300" class="has-text-grey is-size-7">{{ $t('asset.more', { n: shown.length - 300 }) }}</p>
    </div>
  </section>
</template>
