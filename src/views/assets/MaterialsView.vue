<script setup>
import { ref, computed } from 'vue'
import { isTech } from '../../stores/auth.js'
import { inv, startInventory, materialList, assetGroups, typeName } from '../../stores/inventory.js'
import { reorderQty, isLow } from '../../services/inventory.js'
import { ln } from '../../i18n/index.js'

startInventory()
const q = ref('')
const group = ref('')
const store = ref('')
const low = ref(false)
const inactive = ref(false)
const stores = computed(() => [...new Set(materialList.value.map((m) => m.store).filter(Boolean))].sort())

const shown = computed(() => {
  const s = q.value.trim().toLowerCase()
  return materialList.value.filter((m) => {
    if (!inactive.value && m.active === false) return false
    if (group.value && m.typeId !== group.value && inv.assetTypes[m.typeId]?.parentId !== group.value) return false
    if (store.value && m.store !== store.value) return false
    if (low.value && !isLow(m)) return false
    return !s || [m.code, m.name, m.brand, m.model, m.detail, typeName(m.typeId)].join(' ').toLowerCase().includes(s)
  })
})
const lowCount = computed(() => materialList.value.filter((m) => m.active !== false && isLow(m)).length)
</script>

<template>
  <section class="section">
    <div class="container">
      <div class="is-flex is-justify-content-space-between is-align-items-center mb-3" style="gap:.5rem">
        <h1 class="title is-4 mb-0">{{ $t('material.title') }}</h1>
        <div class="is-flex is-align-items-center" style="gap:.5rem">
          <span class="tag is-light">{{ $t('asset.count', { n: shown.length }) }}</span>
          <router-link v-if="isTech" to="/materials/new" class="button is-primary is-small"><span class="icon"><i class="mdi mdi-plus"></i></span><span>{{ $t('material.add') }}</span></router-link>
        </div>
      </div>

      <div class="columns is-mobile is-multiline mb-1">
        <div class="column is-12-mobile is-4-tablet">
          <p class="control has-icons-left"><input class="input" v-model="q" :placeholder="$t('material.searchPh')" /><span class="icon is-left"><i class="mdi mdi-magnify"></i></span></p>
        </div>
        <div class="column is-6-mobile is-3-tablet">
          <div class="select is-fullwidth"><select v-model="group">
            <option value="">{{ $t('asset.group') }}: {{ $t('common.all') }}</option>
            <option v-for="g in assetGroups" :key="g.id" :value="g.id">{{ ln(g) }}</option>
          </select></div>
        </div>
        <div class="column is-6-mobile is-2-tablet" v-if="stores.length">
          <div class="select is-fullwidth"><select v-model="store">
            <option value="">{{ $t('material.store') }}: {{ $t('common.all') }}</option>
            <option v-for="s in stores" :key="s" :value="s">{{ s }}</option>
          </select></div>
        </div>
        <div class="column is-12-mobile is-3-tablet is-flex is-align-items-center is-flex-wrap-wrap" style="gap:.75rem">
          <label class="checkbox is-size-7"><input type="checkbox" v-model="low" /> {{ $t('material.lowOnly') }} ({{ lowCount }})</label>
          <label class="checkbox is-size-7"><input type="checkbox" v-model="inactive" /> {{ $t('material.showInactive') }}</label>
        </div>
      </div>

      <p v-if="!inv.loaded"><i class="mdi mdi-loading mdi-spin"></i> {{ $t('common.loading') }}</p>
      <p v-else-if="!shown.length" class="has-text-grey">{{ $t('common.noData') }}</p>
      <div class="columns is-multiline">
        <div class="column is-6-tablet is-4-widescreen" v-for="m in shown" :key="m.id">
          <router-link :to="'/materials/' + m.id" class="has-text-dark">
            <div class="card is-clickable" style="height:100%" :style="m.active === false ? 'opacity:.6' : ''">
              <div class="card-content p-4">
                <div class="is-flex is-justify-content-space-between is-align-items-start" style="gap:.5rem">
                  <div>
                    <p class="has-text-weight-bold is-size-7"><i class="mdi mdi-package-variant has-text-primary"></i> {{ m.code }}</p>
                    <p>{{ m.name }}</p>
                    <p class="is-size-7 has-text-grey">{{ typeName(m.typeId) }}<template v-if="m.store"> · {{ m.store }}</template></p>
                  </div>
                  <div class="has-text-right" style="white-space:nowrap">
                    <p class="is-size-4 has-text-weight-bold" :class="isLow(m) ? 'has-text-danger' : 'has-text-primary'">{{ m.onHand ?? 0 }}</p>
                    <p class="is-size-7 has-text-grey">{{ m.unit }}</p>
                  </div>
                </div>
                <p class="is-size-7 mt-1 has-text-grey">
                  Min {{ m.min ?? '-' }} · Max {{ m.max ?? '-' }}
                  <span v-if="reorderQty(m)" class="tag is-danger is-light ml-1">{{ $t('material.reorder') }} {{ reorderQty(m) }}</span>
                  <span v-if="m.price" class="ml-1">· {{ Number(m.price).toLocaleString() }} ฿</span>
                </p>
              </div>
            </div>
          </router-link>
        </div>
      </div>
    </div>
  </section>
</template>
