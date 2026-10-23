<script setup>
import { ref, reactive, computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { ref as dbRef, onValue, update, set, remove, serverTimestamp } from 'firebase/database'
import { db } from '../../firebase.js'
import { authState } from '../../stores/auth.js'
import { ROLES, emailKey, toArray } from '../../services/util.js'
import { fmtDate } from '../../i18n/index.js'
import { toast, toastError } from '../../stores/toast.js'

const { t } = useI18n()
const users = ref([])
const invites = ref([])
const q = ref('')
const roleFilter = ref('')
const inv = reactive({ email: '', name: '', company: '', role: 'contractor' })

const u1 = onValue(dbRef(db, 'users'), (s) => (users.value = toArray(s.val()).sort((a, b) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0))), toastError)
const u2 = onValue(dbRef(db, 'invites'), (s) => (invites.value = toArray(s.val())), toastError)
onBeforeUnmount(() => { u1(); u2() })

const filtered = computed(() => {
  const s = q.value.toLowerCase()
  return users.value.filter((u) => (!roleFilter.value || u.role === roleFilter.value) && (!s || `${u.displayName} ${u.email} ${u.company || ''} ${u.department || ''}`.toLowerCase().includes(s)))
})

async function setRole(u, role) {
  if (u.id === authState.user.uid && role !== 'admin' && !confirm('Remove your own admin role?')) return
  try { await update(dbRef(db, `users/${u.id}`), { role }); toast(t('common.saved')) } catch (e) { toastError(e) }
}
async function invite() {
  if (!inv.email) return
  try {
    await set(dbRef(db, `invites/${emailKey(inv.email)}`), { email: inv.email.trim().toLowerCase(), name: inv.name, company: inv.company, role: inv.role, invitedBy: authState.user.uid, createdAt: serverTimestamp() })
    // If the person already has an account, upgrade now
    const existing = users.value.find((u) => u.email === inv.email.trim().toLowerCase())
    if (existing && existing.role === 'user') await update(dbRef(db, `users/${existing.id}`), { role: inv.role, company: inv.company || null })
    Object.assign(inv, { email: '', name: '', company: '' }); toast(t('common.saved'))
  } catch (e) { toastError(e) }
}
const removeInvite = (i) => remove(dbRef(db, `invites/${i.id}`)).catch(toastError)
const providerIcons = { 'microsoft_com': 'mdi-microsoft', 'google_com': 'mdi-google', password: 'mdi-email-lock', emailLink: 'mdi-email-fast' }
</script>

<template>
  <section class="section">
    <div class="container">
      <h1 class="title is-4">{{ $t('users.title') }}</h1>
      <div class="columns">
        <div class="column is-8">
          <div class="columns is-mobile mb-0">
            <div class="column"><input class="input is-small" v-model="q" :placeholder="$t('common.search')" /></div>
            <div class="column is-narrow"><div class="select is-small"><select v-model="roleFilter">
              <option value="">{{ $t('users.filterRole') }}</option><option v-for="r in ROLES" :key="r" :value="r">{{ $t('roles.' + r) }}</option></select></div></div>
          </div>
          <div class="box p-0">
            <div v-for="u in filtered" :key="u.id" class="p-3 is-flex is-justify-content-space-between is-align-items-center is-flex-wrap-wrap" style="border-bottom:1px solid #f2f2f2;gap:.5rem">
              <div>
                <p class="has-text-weight-semibold">{{ u.displayName || '-' }} <span v-if="u.company" class="tag is-light is-small">{{ u.company }}</span></p>
                <p class="is-size-7 has-text-grey">{{ u.email }} <i v-for="(v, p) in u.providers" :key="p" class="mdi ml-1" :class="providerIcons[p] || 'mdi-key'" :title="p"></i></p>
                <p class="is-size-7 has-text-grey">{{ $t('users.lastLogin') }}: {{ fmtDate(u.lastLoginAt) }}</p>
              </div>
              <div class="select is-small"><select :value="u.role" @change="setRole(u, $event.target.value)">
                <option v-for="r in ROLES" :key="r" :value="r">{{ $t('roles.' + r) }}</option></select></div>
            </div>
            <p v-if="!filtered.length" class="p-3 has-text-grey">{{ $t('common.noData') }}</p>
          </div>
        </div>
        <div class="column is-4">
          <form class="box action-box" @submit.prevent="invite">
            <h2 class="title is-6 mb-1">{{ $t('users.invite') }}</h2>
            <p class="is-size-7 has-text-grey mb-3">{{ $t('users.inviteHint') }}</p>
            <div class="field"><input class="input is-small" type="email" v-model="inv.email" :placeholder="$t('auth.email')" required /></div>
            <div class="field"><input class="input is-small" v-model="inv.name" :placeholder="$t('auth.displayName')" /></div>
            <div class="field"><input class="input is-small" v-model="inv.company" :placeholder="$t('profile.company')" /></div>
            <div class="field"><div class="select is-small is-fullwidth"><select v-model="inv.role">
              <option value="contractor">{{ $t('roles.contractor') }}</option><option value="technician">{{ $t('roles.technician') }}</option></select></div></div>
            <button class="button is-primary is-small is-fullwidth">{{ $t('common.send') }}</button>
          </form>
          <div class="box">
            <h2 class="title is-6">{{ $t('users.invites') }}</h2>
            <p v-if="!invites.length" class="is-size-7 has-text-grey">{{ $t('common.noData') }}</p>
            <div v-for="i in invites" :key="i.id" class="is-flex is-justify-content-space-between is-size-7 mb-2">
              <span>{{ i.email }}<br /><span class="has-text-grey">{{ $t('roles.' + i.role) }} {{ i.company ? '· ' + i.company : '' }}</span></span>
              <button class="delete is-small" @click="removeInvite(i)"></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
