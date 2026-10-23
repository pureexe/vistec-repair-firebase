<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { authState, role, isStaff, isTech, isAdmin } from './stores/auth.js'
import { toasts } from './stores/toast.js'
import { setLocale } from './i18n/index.js'
import { logout } from './services/authService.js'
import { isConfigured } from './firebase.js'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const menuOpen = ref(false)
watch(() => route.fullPath, () => (menuOpen.value = false))

function toggleLang() { setLocale(locale.value === 'th' ? 'en' : 'th') }
async function doLogout() { await logout(); router.push('/') }
const userName = computed(() => authState.profile?.displayName || authState.user?.displayName || authState.user?.email || '')
</script>

<template>
  <nav class="navbar is-vistec" role="navigation">
    <div class="container">
      <div class="navbar-brand">
        <router-link to="/" class="navbar-item">
          <span class="icon is-medium mr-2"><i class="mdi mdi-wrench-cog mdi-24px"></i></span>
          <span>
            <div class="brand-title">{{ t('app.name') }}</div>
            <div class="brand-sub is-hidden-mobile">{{ t('app.sub') }}</div>
          </span>
        </router-link>
        <a class="navbar-item ml-auto is-hidden-desktop" @click="toggleLang" :title="t('profile.language')">
          <strong>{{ locale === 'th' ? 'EN' : 'TH' }}</strong>
        </a>
        <a role="button" class="navbar-burger ml-0" :class="{ 'is-active': menuOpen }" @click="menuOpen = !menuOpen" aria-label="menu">
          <span></span><span></span><span></span><span></span>
        </a>
      </div>
      <div class="navbar-menu" :class="{ 'is-active': menuOpen }">
        <div class="navbar-start">
          <router-link class="navbar-item" to="/request">{{ t('nav.request') }}</router-link>
          <router-link class="navbar-item" to="/t">{{ t('nav.track') }}</router-link>
          <router-link v-if="authState.user" class="navbar-item" to="/my">{{ t('nav.myJobs') }}</router-link>
          <router-link v-if="isStaff" class="navbar-item" to="/jobs">{{ t('nav.jobs') }}</router-link>
          <router-link v-if="isTech" class="navbar-item" to="/dashboard">{{ t('nav.dashboard') }}</router-link>
          <div v-if="isTech" class="navbar-item has-dropdown is-hoverable">
            <a class="navbar-link">{{ t('nav.admin') }}</a>
            <div class="navbar-dropdown">
              <router-link v-if="isAdmin" class="navbar-item" to="/admin/master">{{ t('nav.master') }}</router-link>
              <router-link v-if="isAdmin" class="navbar-item" to="/admin/users">{{ t('nav.users') }}</router-link>
              <router-link class="navbar-item" to="/admin/qr">{{ t('nav.qr') }}</router-link>
            </div>
          </div>
        </div>
        <div class="navbar-end">
          <a class="navbar-item is-hidden-touch" @click="toggleLang"><span class="icon"><i class="mdi mdi-translate"></i></span><span>{{ locale === 'th' ? 'English' : 'ภาษาไทย' }}</span></a>
          <template v-if="authState.user">
            <router-link class="navbar-item" to="/profile">
              <span class="icon"><i class="mdi mdi-account-circle"></i></span>
              <span>{{ userName }} <span class="tag is-light ml-1" v-if="role && role !== 'user'">{{ t('roles.' + role) }}</span></span>
            </router-link>
            <a class="navbar-item" @click="doLogout"><span class="icon"><i class="mdi mdi-logout"></i></span><span>{{ t('nav.logout') }}</span></a>
          </template>
          <router-link v-else class="navbar-item" to="/login"><span class="icon"><i class="mdi mdi-login"></i></span><span>{{ t('nav.login') }}</span></router-link>
        </div>
      </div>
    </div>
  </nav>

  <div v-if="!isConfigured" class="notification is-warning is-light mb-0 has-text-centered">{{ t('common.notConfigured') }}</div>

  <main class="app-main">
    <router-view />
  </main>

  <!-- Bottom tab bar on phones / tablets -->
  <nav class="mobile-tabbar no-print">
    <router-link to="/"><span class="icon"><i class="mdi mdi-home"></i></span>{{ t('nav.home') }}</router-link>
    <router-link to="/request"><span class="icon"><i class="mdi mdi-plus-circle"></i></span>{{ t('nav.request') }}</router-link>
    <router-link v-if="isStaff" to="/jobs"><span class="icon"><i class="mdi mdi-clipboard-list"></i></span>{{ t('nav.jobs') }}</router-link>
    <router-link v-else-if="authState.user" to="/my"><span class="icon"><i class="mdi mdi-clipboard-text-clock"></i></span>{{ t('nav.myJobs') }}</router-link>
    <router-link to="/t"><span class="icon"><i class="mdi mdi-magnify"></i></span>{{ t('nav.track') }}</router-link>
    <router-link v-if="authState.user" to="/profile"><span class="icon"><i class="mdi mdi-account"></i></span>{{ t('nav.profile') }}</router-link>
    <router-link v-else to="/login"><span class="icon"><i class="mdi mdi-login"></i></span>{{ t('nav.login') }}</router-link>
  </nav>

  <div style="position:fixed;top:4.5rem;right:1rem;left:1rem;z-index:100;pointer-events:none" class="no-print">
    <div v-for="m in toasts" :key="m.id" class="notification is-light" :class="m.type" style="max-width:420px;margin:0 0 .5rem auto;pointer-events:auto">
      {{ m.message }}
    </div>
  </div>
</template>
