<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { normalizeCode } from '../services/util.js'
const router = useRouter()
const route = useRoute()
const code = ref('')
const track = () => { const c = normalizeCode(code.value); if (c) router.push('/t/' + c) }
</script>

<template>
  <section class="hero is-vistec">
    <div class="hero-body">
      <div class="container">
        <p class="is-size-7 mb-2" style="opacity:.85">{{ $t('app.org') }}</p>
        <h1 class="title is-3">{{ $t('home.heroTitle') }}</h1>
        <p class="subtitle is-6 mt-2" style="max-width:640px">{{ $t('home.heroText') }}</p>
        <router-link to="/request" class="button is-white is-medium has-text-primary has-text-weight-bold">
          <span class="icon"><i class="mdi mdi-wrench"></i></span><span>{{ $t('home.startRequest') }}</span>
        </router-link>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container" style="max-width:860px">
      <div v-if="route.query.denied" class="notification is-danger is-light">{{ $t('err.permission') }}</div>
      <div class="box action-box">
        <h2 class="title is-5"><i class="mdi mdi-magnify"></i> {{ $t('home.trackTitle') }}</h2>
        <form @submit.prevent="track" class="field has-addons">
          <div class="control is-expanded">
            <input v-model="code" class="input is-medium tracking-code" style="font-size:1.1rem" :placeholder="$t('home.trackPlaceholder')" maxlength="12" autocapitalize="characters" />
          </div>
          <div class="control"><button class="button is-primary is-medium">{{ $t('track.lookup') }}</button></div>
        </form>
      </div>

      <div class="columns is-multiline mt-4">
        <div class="column is-4" v-for="(f, i) in [['mdi-crosshairs-gps', 'home.feat1'], ['mdi-email-fast', 'home.feat2'], ['mdi-calendar-clock', 'home.feat3']]" :key="i">
          <div class="box has-text-centered" style="height:100%">
            <span class="icon is-large" :class="i === 1 ? 'has-text-vistec-red' : 'has-text-primary'"><i class="mdi mdi-36px" :class="f[0]"></i></span>
            <p class="mt-2">{{ $t(f[1]) }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
