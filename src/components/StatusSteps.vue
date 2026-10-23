<script setup>
import { computed } from 'vue'
const props = defineProps({ status: String })
const steps = ['new', 'assigned', 'in_progress', 'completed']
const icons = { new: 'mdi-inbox-arrow-down', assigned: 'mdi-account-hard-hat', in_progress: 'mdi-progress-wrench', completed: 'mdi-check' }
const idx = computed(() => {
  if (props.status === 'on_hold') return 2
  if (props.status === 'cancelled') return -1
  return steps.indexOf(props.status)
})
</script>
<template>
  <div class="steps" v-if="status !== 'cancelled'">
    <div v-for="(s, i) in steps" :key="s" class="step"
      :class="{ 'is-done': i <= idx, 'is-current': i === idx, 'is-problem': i === idx && status === 'on_hold' }">
      <div class="dot"><i class="mdi" :class="i === idx && status === 'on_hold' ? 'mdi-pause' : icons[s]"></i></div>
      {{ i === idx && status === 'on_hold' ? $t('status.on_hold') : $t('status.' + s) }}
    </div>
  </div>
</template>
