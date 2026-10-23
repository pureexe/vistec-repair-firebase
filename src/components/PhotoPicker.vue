<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { compressImage } from '../services/images.js'
import { toast } from '../stores/toast.js'

const props = defineProps({ modelValue: { type: Array, default: () => [] }, max: { type: Number, default: 3 } })
const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()
const busy = ref(false)
const previews = ref([])

async function onPick(ev) {
  const files = Array.from(ev.target.files || [])
  ev.target.value = ''
  const room = props.max - props.modelValue.length
  if (files.length > room) toast(t('err.tooMany', { n: props.max }), 'is-warning')
  busy.value = true
  const out = [...props.modelValue]
  for (const f of files.slice(0, room)) {
    try {
      const img = await compressImage(f)
      img.preview = URL.createObjectURL(img.blob)
      previews.value.push(img.preview)
      out.push(img)
    } catch (e) { console.warn(e); toast(t('err.image'), 'is-danger') }
  }
  busy.value = false
  emit('update:modelValue', out)
}
function removeAt(i) {
  const out = [...props.modelValue]
  out.splice(i, 1)
  emit('update:modelValue', out)
}
onBeforeUnmount(() => previews.value.forEach((u) => URL.revokeObjectURL(u)))
</script>

<template>
  <div>
    <div class="photo-grid mb-2" v-if="modelValue.length">
      <div class="photo" v-for="(p, i) in modelValue" :key="p.preview">
        <img :src="p.preview" alt="" />
        <button type="button" class="delete" @click="removeAt(i)"></button>
        <span class="tag is-dark is-small" style="position:absolute;left:4px;bottom:4px;opacity:.8">{{ Math.round(p.bytes / 1024) }} KB</span>
      </div>
    </div>
    <div class="file is-primary is-light" v-if="modelValue.length < max">
      <label class="file-label">
        <input class="file-input" type="file" accept="image/*" multiple @change="onPick" :disabled="busy" />
        <span class="file-cta">
          <span class="file-icon"><i class="mdi" :class="busy ? 'mdi-loading mdi-spin' : 'mdi-camera-plus'"></i></span>
          <span class="file-label">{{ $t('jobs.addPhoto') }} ({{ modelValue.length }}/{{ max }})</span>
        </span>
      </label>
    </div>
  </div>
</template>
