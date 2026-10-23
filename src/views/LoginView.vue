<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { authState } from '../stores/auth.js'
import { signInWith, loginEmail, registerEmail, resetPassword, sendLoginLink, authErrorMessage } from '../services/authService.js'
import { toast } from '../stores/toast.js'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const mode = ref('login') // login | register
const email = ref(''); const password = ref(''); const name = ref('')
const busy = ref(''); const msg = ref(''); const err = ref('')

const next = () => router.replace(route.query.next || '/')
watch(() => authState.user, (u) => { if (u) next() }, { immediate: true })

async function run(key, fn) {
  busy.value = key; err.value = ''; msg.value = ''
  try { await fn() } catch (e) { const m = authErrorMessage(e, t); if (m) err.value = m } finally { busy.value = '' }
}
const oauth = (id) => run(id, () => signInWith(id))
const submit = () => run('email', async () => {
  if (mode.value === 'register') { await registerEmail(email.value, password.value, name.value); toast(t('auth.verifySent')) }
  else await loginEmail(email.value, password.value)
})
const forgot = () => run('forgot', async () => { await resetPassword(email.value); msg.value = t('auth.resetSent') })
const link = () => run('link', async () => { await sendLoginLink(email.value); msg.value = t('auth.linkSent', { email: email.value }) })
</script>

<template>
  <section class="section">
    <div class="container" style="max-width:440px">
      <div class="box">
        <h1 class="title is-4 mb-1">{{ $t('auth.title') }}</h1>
        <div class="accent-bar mb-3"></div>
        <p class="is-size-7 has-text-grey mb-4">{{ route.query.next?.startsWith('/request') ? $t('auth.needLogin') : $t('auth.subtitle') }}</p>

        <button class="button is-primary is-fullwidth login-btn mb-2" :class="{ 'is-loading': busy === 'microsoft.com' }" @click="oauth('microsoft.com')">
          <span class="icon"><i class="mdi mdi-microsoft"></i></span><span>{{ $t('auth.microsoft') }}</span>
        </button>
        <button class="button is-fullwidth login-btn mb-4" :class="{ 'is-loading': busy === 'google.com' }" @click="oauth('google.com')">
          <span class="icon has-text-danger"><i class="mdi mdi-google"></i></span><span>{{ $t('auth.google') }}</span>
        </button>

        <p class="is-size-7 has-text-centered has-text-grey mb-3">— {{ $t('auth.orEmail') }} —</p>
        <form @submit.prevent="submit">
          <div class="field" v-if="mode === 'register'">
            <div class="control has-icons-left"><input class="input" v-model="name" :placeholder="$t('auth.displayName')" required /><span class="icon is-left"><i class="mdi mdi-account"></i></span></div>
          </div>
          <div class="field">
            <div class="control has-icons-left"><input class="input" type="email" v-model="email" :placeholder="$t('auth.email')" required autocomplete="email" /><span class="icon is-left"><i class="mdi mdi-email"></i></span></div>
          </div>
          <div class="field">
            <div class="control has-icons-left"><input class="input" type="password" v-model="password" :placeholder="$t('auth.password')" :required="true" minlength="6" autocomplete="current-password" /><span class="icon is-left"><i class="mdi mdi-lock"></i></span></div>
          </div>
          <button class="button is-danger is-fullwidth" :class="{ 'is-loading': busy === 'email' }">{{ mode === 'register' ? $t('auth.register') : $t('auth.signIn') }}</button>
        </form>
        <div class="is-flex is-justify-content-space-between mt-2 is-size-7">
          <a @click="mode = mode === 'login' ? 'register' : 'login'">{{ mode === 'login' ? $t('auth.noAccount') : $t('auth.haveAccount') }}</a>
          <a v-if="mode === 'login'" @click="email && forgot()" :class="{ 'has-text-grey-light': !email }">{{ $t('auth.forgot') }}</a>
        </div>

        <hr />
        <p class="is-size-7 has-text-grey mb-2"><i class="mdi mdi-account-hard-hat"></i> {{ $t('auth.contractorHint') }}</p>
        <button class="button is-fullwidth is-primary is-outlined wrap" :disabled="!email" :class="{ 'is-loading': busy === 'link' }" @click="link">
          <span class="icon"><i class="mdi mdi-email-fast"></i></span><span>{{ $t('auth.emailLink') }}</span>
        </button>

        <div v-if="msg" class="notification is-success is-light mt-3">{{ msg }}</div>
        <div v-if="err" class="notification is-danger is-light mt-3">{{ err }}</div>
      </div>
    </div>
  </section>
</template>
