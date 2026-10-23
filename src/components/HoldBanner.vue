<script setup>
import { fmtDate } from '../i18n/index.js'
defineProps({ hold: Object, expectedDate: Number, expectedNote: String, status: String })
</script>
<template>
  <div>
    <div v-if="status === 'on_hold' && hold" class="notification is-danger is-light">
      <p class="has-text-weight-bold mb-1"><i class="mdi mdi-pause-circle"></i> {{ $t('track.onHoldTitle') }}: {{ $t('hold.' + (hold.reason || 'other')) }}</p>
      <p v-if="hold.note" class="mb-1" style="white-space:pre-line">{{ hold.note }}</p>
      <p v-if="hold.partsEta"><i class="mdi mdi-truck-delivery"></i> {{ $t('hold.partsEta') }}: <strong>{{ fmtDate(hold.partsEta, false) }}</strong></p>
      <p v-if="hold.resumeDate"><i class="mdi mdi-calendar-refresh"></i> {{ $t('hold.resumeDate') }}: <strong>{{ fmtDate(hold.resumeDate, false) }}</strong></p>
    </div>
    <div v-if="status !== 'completed' && status !== 'cancelled'" class="notification has-background-vistec-soft">
      <p class="is-size-7 has-text-grey">{{ $t('track.expected') }}</p>
      <p v-if="expectedDate" class="is-size-4 has-text-weight-bold has-text-primary"><i class="mdi mdi-calendar-check"></i> {{ fmtDate(expectedDate, false) }}</p>
      <p v-else class="has-text-grey">{{ $t('track.expectedUnknown') }}</p>
      <p v-if="expectedNote" class="mt-1" style="white-space:pre-line">{{ expectedNote }}</p>
    </div>
  </div>
</template>
