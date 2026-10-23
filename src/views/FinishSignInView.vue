<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { isLoginLink, completeLoginLink, authErrorMessage } from '../services/authService.js'
const { t } = useI18n()
const router = useRouter()
const email = ref(''); const need = ref(false); const err = ref(''); const busy = ref(false)

async function finish() {
  busy.value = true; err.value = ''
  try { await completeLoginLink(email.value, location.href); router.replace('/') }
  catch (e) { err.value = authErrorMessage(e, t) } finally { busy.value = false }
}
onMounted(() => {
  if (!isLoginLink(location.href)) return router.replace('/login')
  try { email.value = localStorage.getItem('emailForSignIn') || '' } catch {}
  if (email.value) finish(); else need.value = true
})
</script>
<template>
  <section class="section">
    <div class="container" style="max-width:420px">
      <div class="box">
        <p v-if="!need && !err"><i class="mdi mdi-loading mdi-spin"></i> {{ $t('auth.finishing') }}</p>
        <form v-if="need" @submit.prevent="finish">
          <p class="mb-3">{{ $t('auth.confirmEmail') }}</p>
          <input class="input mb-3" type="email" v-model="email" required />
          <button class="button is-primary is-fullwidth" :class="{ 'is-loading': busy }">{{ $t('auth.signIn') }}</button>
        </form>
        <div v-if="err" class="notification is-danger is-light mt-3">{{ err }}</div>
      </div>
    </div>
  </section>
</template>
