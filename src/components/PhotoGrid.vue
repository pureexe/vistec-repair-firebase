<script setup>
import { ref, watch } from 'vue'
import { photoSrc } from '../services/images.js'
const props = defineProps({ jobId: String, photos: Object, deletable: Boolean })
const emit = defineEmits(['delete'])
const srcs = ref({})
const open = ref(null)
watch(() => props.photos, async (p) => {
  for (const [pid, meta] of Object.entries(p || {})) {
    if (!srcs.value[pid]) srcs.value[pid] = await photoSrc(props.jobId, pid, meta)
  }
}, { immediate: true, deep: true })
</script>
<template>
  <div>
    <div class="photo-grid" v-if="photos && Object.keys(photos).length">
      <div class="photo" v-for="(meta, pid) in photos" :key="pid">
        <img v-if="srcs[pid]" :src="srcs[pid]" alt="" @click="open = srcs[pid]" style="cursor:zoom-in" loading="lazy" />
        <button v-if="deletable" type="button" class="delete" @click="emit('delete', pid, meta)"></button>
      </div>
    </div>
    <p v-else class="has-text-grey is-size-7">{{ $t('common.noData') }}</p>
    <div class="modal" :class="{ 'is-active': open }">
      <div class="modal-background" @click="open = null"></div>
      <div class="modal-content has-text-centered"><img :src="open" alt="" style="max-height:85vh" /></div>
      <button class="modal-close is-large" @click="open = null"></button>
    </div>
  </div>
</template>
