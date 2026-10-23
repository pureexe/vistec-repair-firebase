<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { authState } from '../stores/auth.js'
import { listenMyJobs } from '../services/jobs.js'
import JobCard from '../components/JobCard.vue'
const jobs = ref(null)
const unsub = listenMyJobs(authState.user.uid, (j) => (jobs.value = j), () => (jobs.value = []))
onBeforeUnmount(unsub)
</script>
<template>
  <section class="section">
    <div class="container" style="max-width:820px">
      <div class="is-flex is-justify-content-space-between is-align-items-center mb-3">
        <h1 class="title is-4 mb-0">{{ $t('jobs.mine') }}</h1>
        <router-link to="/request" class="button is-primary is-small"><span class="icon"><i class="mdi mdi-plus"></i></span><span>{{ $t('jobs.newRequest') }}</span></router-link>
      </div>
      <p v-if="jobs === null"><i class="mdi mdi-loading mdi-spin"></i> {{ $t('common.loading') }}</p>
      <p v-else-if="!jobs.length" class="has-text-grey">{{ $t('jobs.empty') }}</p>
      <router-link v-for="j in jobs" :key="j.id" :to="'/t/' + j.trackingCode" class="has-text-dark"><JobCard :job="j" /></router-link>
    </div>
  </section>
</template>
