<script setup>
import { computed } from 'vue'
import StatusTag from './StatusTag.vue'
import { master } from '../stores/master.js'
import { ln, fmtDate } from '../i18n/index.js'
const props = defineProps({ job: Object, showReporter: Boolean })
const overdue = computed(() => props.job.expectedDate && props.job.expectedDate < Date.now() && !['completed', 'cancelled'].includes(props.job.status))
const jt = computed(() => master.jobTypes[props.job.jobTypeId])
</script>
<template>
  <div class="card is-clickable mb-3">
    <div class="card-content p-4">
      <div class="is-flex is-justify-content-space-between is-align-items-start mb-2" style="gap:.5rem">
        <div>
          <p class="has-text-weight-bold">
            <span class="icon has-text-primary"><i class="mdi" :class="jt?.icon || 'mdi-wrench'"></i></span>
            {{ job.jobNo }}
            <span v-if="job.priority === 'urgent'" class="tag is-danger is-small ml-1">{{ $t('priority.urgent') }}</span>
          </p>
          <p class="is-size-7 has-text-grey">{{ ln(jt) }} · {{ fmtDate(job.createdAt) }}</p>
        </div>
        <StatusTag :status="job.status" />
      </div>
      <p class="mb-2" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">{{ job.description }}</p>
      <p class="is-size-7 has-text-grey">
        <i class="mdi mdi-map-marker"></i> {{ ln(master.buildings[job.buildingId]) }}<template v-if="master.areas[job.areaId]"> › {{ ln(master.areas[job.areaId]) }}</template><template v-if="job.locationDetail"> · {{ job.locationDetail }}</template>
      </p>
      <p class="is-size-7 mt-1">
        <span v-if="showReporter" class="mr-3"><i class="mdi mdi-account"></i> {{ job.reporter?.name }}</span>
        <span class="mr-3"><i class="mdi mdi-account-hard-hat"></i> {{ job.assigneeName || $t('jobs.unassigned') }}</span>
        <span v-if="job.expectedDate" :class="{ 'has-text-danger has-text-weight-bold': overdue }"><i class="mdi mdi-calendar-check"></i> {{ fmtDate(job.expectedDate, false) }} <template v-if="overdue">({{ $t('jobs.overdue') }})</template></span>
      </p>
    </div>
  </div>
</template>
