<script setup>
import { statusColor, statusIcon } from '../services/util.js'
defineProps({ status: String, size: { type: String, default: '' } })
</script>
<template>
  <span class="tag" :class="[statusColor[status], size]">
    <span class="icon is-small"><i class="mdi" :class="statusIcon[status]"></i></span>
    <span>{{ $t('status.' + status) }}</span>
  </span>
</template>
