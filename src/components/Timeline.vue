<script setup>
import { useI18n } from 'vue-i18n'
import { fmtDate } from '../i18n/index.js'
defineProps({ events: Array, staff: Boolean })
const { t } = useI18n()
function title(e) {
  switch (e.type) {
    case 'created': return t('event.created')
    case 'status': return t('event.status', { to: t('status.' + e.to) })
    case 'assign': return t('event.assign', { to: e.to })
    case 'hold': return t('event.hold', { to: t('hold.' + (e.to || 'other')) })
    case 'expected': return t('event.expected') + (e.to ? ': ' + fmtDate(Number(e.to), false) : ' -')
    case 'photo': return t('event.photo')
    default: return t('event.comment')
  }
}
</script>
<template>
  <ul class="timeline-list">
    <li v-for="e in events" :key="e.id" :class="{ 'is-problem': e.type === 'hold' || e.to === 'cancelled', 'is-internal': staff && !e.public }">
      <p class="is-size-7 has-text-grey">
        {{ fmtDate(e.at) }}
        <template v-if="staff"> · {{ e.byName }} <span v-if="!e.public" class="tag is-light is-small">{{ $t('jobs.internal') }}</span></template>
      </p>
      <p class="has-text-weight-semibold">{{ title(e) }}</p>
      <p v-if="e.note && e.type !== 'photo'" style="white-space:pre-line">{{ e.note }}</p>
    </li>
  </ul>
</template>
