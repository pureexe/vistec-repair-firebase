<script setup>
import { reactive, ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ref as dbRef, update } from 'firebase/database'
import { updateProfile } from 'firebase/auth'
import { auth, db } from '../firebase.js'
import { authState, role } from '../stores/auth.js'
import { setLocale } from '../i18n/index.js'
import { linkProvider, linkPassword, unlinkProvider, authErrorMessage } from '../services/authService.js'
import { toast, toastError } from '../stores/toast.js'

const { t, locale } = useI18n()
const form = reactive({ displayName: '', phone: '', department: '', lang: 'th' })
const busy = ref('')
const pw = ref('')
const tick = ref(0) // re-evaluate providerData after linking

watch(() => authState.profile, (p) => {
  if (!p) return
  Object.assign(form, { displayName: p.displayName || '', phone: p.phone || '', department: p.department || '', lang: p.lang || locale.value })
}, { immediate: true })

const providers = computed(() => { tick.value; return (auth.currentUser?.providerData || []).map((p) => p.providerId) })
const all = [
  { id: 'microsoft.com', icon: 'mdi-microsoft', label: 'Microsoft' },
  { id: 'google.com', icon: 'mdi-google', label: 'Google' },
  { id: 'password', icon: 'mdi-email-lock', label: 'E-mail / password' }
]

async function save() {
  busy.value = 'save'
  try {
    await update(dbRef(db, `users/${authState.user.uid}`), { ...form })
    if (form.displayName && auth.currentUser.displayName !== form.displayName) await updateProfile(auth.currentUser, { displayName: form.displayName })
    setLocale(form.lang)
    toast(t('common.saved'))
  } catch (e) { toastError(e) } finally { busy.value = '' }
}

async function syncProviders() {
  tick.value++
  const p = Object.fromEntries((auth.currentUser?.providerData || []).map((x) => [x.providerId.replace(/\./g, '_'), true]))
  await update(dbRef(db, `users/${authState.user.uid}`), { providers: p })
}
async function link(id) {
  busy.value = id
  try {
    if (id === 'password') { if (pw.value.length < 6) return; await linkPassword(pw.value); pw.value = '' }
    else await linkProvider(id)
    await syncProviders(); toast(t('profile.linkedOk'))
  } catch (e) { const m = authErrorMessage(e, t); if (m) toast(m, 'is-danger', 8000) } finally { busy.value = '' }
}
async function unlink(id) {
  if (providers.value.length < 2) return
  busy.value = id
  try { await unlinkProvider(id); await syncProviders() } catch (e) { toastError(e) } finally { busy.value = '' }
}
</script>

<template>
  <section class="section">
    <div class="container" style="max-width:640px">
      <h1 class="title is-4">{{ $t('profile.title') }}</h1>
      <form class="box" @submit.prevent="save">
        <p class="mb-3"><i class="mdi mdi-email"></i> {{ authState.user?.email }} · <span class="tag is-primary is-light">{{ $t('roles.' + (role || 'user')) }}</span>
          <span v-if="authState.profile?.company" class="tag is-light ml-1">{{ authState.profile.company }}</span></p>
        <div class="field"><label class="label">{{ $t('auth.displayName') }}</label><input class="input" v-model="form.displayName" maxlength="120" /></div>
        <div class="field"><label class="label">{{ $t('profile.phone') }}</label><input class="input" type="tel" v-model="form.phone" maxlength="40" /></div>
        <div class="field"><label class="label">{{ $t('profile.department') }}</label><input class="input" v-model="form.department" maxlength="120" /></div>
        <div class="field"><label class="label">{{ $t('profile.language') }}</label>
          <div class="buttons has-addons">
            <button type="button" class="button" :class="{ 'is-primary is-selected': form.lang === 'th' }" @click="form.lang = 'th'">ไทย</button>
            <button type="button" class="button" :class="{ 'is-primary is-selected': form.lang === 'en' }" @click="form.lang = 'en'">English</button>
          </div>
        </div>
        <button class="button is-primary" :class="{ 'is-loading': busy === 'save' }">{{ $t('common.save') }}</button>
      </form>

      <div class="box">
        <h2 class="title is-6 mb-1">{{ $t('profile.linked') }}</h2>
        <p class="is-size-7 has-text-grey mb-3">{{ $t('profile.linkHint') }}</p>
        <div v-for="p in all" :key="p.id" class="is-flex is-align-items-center is-justify-content-space-between py-2" style="border-bottom:1px solid #f0f0f0;gap:.5rem">
          <span><span class="icon"><i class="mdi" :class="p.icon"></i></span> {{ p.label }}</span>
          <template v-if="providers.includes(p.id)">
            <span>
              <span class="tag is-success is-light"><i class="mdi mdi-check mr-1"></i>OK</span>
              <button v-if="providers.length > 1" class="button is-small is-text" :class="{ 'is-loading': busy === p.id }" @click="unlink(p.id)">{{ $t('profile.unlink') }}</button>
            </span>
          </template>
          <template v-else-if="p.id === 'password'">
            <div class="field has-addons mb-0">
              <div class="control"><input class="input is-small" type="password" v-model="pw" :placeholder="$t('profile.setPassword')" minlength="6" :disabled="!authState.user?.email" /></div>
              <div class="control"><button class="button is-small is-primary" :class="{ 'is-loading': busy === p.id }" :disabled="pw.length < 6" @click="link(p.id)">{{ $t('profile.link') }}</button></div>
            </div>
          </template>
          <button v-else class="button is-small is-primary is-light" :class="{ 'is-loading': busy === p.id }" @click="link(p.id)">{{ $t('profile.link') }}</button>
        </div>
      </div>
    </div>
  </section>
</template>
