<script setup>
import { ref, reactive, computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { ref as dbRef, onValue, update, set, remove, push, serverTimestamp } from 'firebase/database'
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
const staff = ref([])
const staffQ = ref('')
const add = reactive({ name: '', role: 'technician', company: '', email: '' })
const pick = reactive({}) // staff id → uid chosen in "link to account"
const mail = reactive({}) // staff id → e-mail being edited

const u1 = onValue(dbRef(db, 'users'), (s) => (users.value = toArray(s.val()).sort((a, b) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0))), toastError)
const u2 = onValue(dbRef(db, 'invites'), (s) => (invites.value = toArray(s.val())), toastError)
const u3 = onValue(dbRef(db, 'staff'), (s) => (staff.value = toArray(s.val()).sort((a, b) => String(a.name).localeCompare(String(b.name), 'th'))), toastError)
onBeforeUnmount(() => { u1(); u2(); u3() })

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
/* ---------- ผู้ปฏิบัติงาน without an account (/staff) ---------- */
const userById = computed(() => Object.fromEntries(users.value.map((u) => [u.id, u])))
const unlinkedUsers = computed(() => users.value.filter((u) => !u.staffId))
const staffShown = computed(() => {
  const s = staffQ.value.toLowerCase()
  return staff.value.filter((x) => !s || `${x.name} ${x.code || ''} ${x.email || ''} ${x.company || ''}`.toLowerCase().includes(s))
})

/** Link a staff record to an account now: their old jobs become theirs; a reporter account gets the staff role */
async function linkStaff(st, uid) {
  const u = userById.value[uid]
  if (!u) return
  const patch = { [`staff/${st.id}/uid`]: uid, [`users/${uid}/staffId`]: st.id }
  if (u.role === 'user') patch[`users/${uid}/role`] = st.role || 'technician'
  try { await update(dbRef(db), patch); toast(t('common.saved')) } catch (e) { toastError(e) }
}
async function unlinkStaff(st) {
  if (!confirm(t('users.unlinkConfirm', { name: st.name }))) return
  try { await update(dbRef(db), { [`staff/${st.id}/uid`]: null, [`users/${st.uid}/staffId`]: null }); toast(t('common.saved')) } catch (e) { toastError(e) }
}
/** E-mail for automatic linking: whoever signs in with it (verified) gets this record and the staff role */
async function saveStaffEmail(st) {
  const email = String(mail[st.id] ?? '').trim().toLowerCase()
  try {
    await update(dbRef(db, `staff/${st.id}`), { email: email || null })
    if (email) {
      await set(dbRef(db, `invites/${emailKey(email)}`), { email, name: st.name, company: st.company || '', role: st.role || 'technician', invitedBy: authState.user.uid, createdAt: serverTimestamp() })
      const existing = users.value.find((u) => u.email === email && !u.staffId)
      if (existing) await linkStaff(st, existing.id)
    }
    delete mail[st.id]; toast(t('common.saved'))
  } catch (e) { toastError(e) }
}
async function addStaff() {
  if (!add.name.trim()) return
  const id = push(dbRef(db, 'staff')).key
  try {
    await set(dbRef(db, `staff/${id}`), { name: add.name.trim(), role: add.role, company: add.company.trim(), active: true, createdAt: Date.now() })
    if (add.email.trim()) { mail[id] = add.email; await saveStaffEmail({ id, name: add.name.trim(), role: add.role, company: add.company.trim() }) }
    Object.assign(add, { name: '', company: '', email: '' }); toast(t('common.saved'))
  } catch (e) { toastError(e) }
}
const removeStaff = (st) => confirm(t('common.delete') + ` ${st.name}?`) && remove(dbRef(db, `staff/${st.id}`)).catch(toastError)

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

      <h2 class="title is-5 mt-5 mb-1">{{ $t('users.staffTitle') }}</h2>
      <p class="is-size-7 has-text-grey mb-3">{{ $t('users.staffHint') }}</p>
      <div class="columns">
        <div class="column is-8">
          <input class="input is-small mb-3" v-model="staffQ" :placeholder="$t('common.search')" />
          <div class="box p-0">
            <div v-for="st in staffShown" :key="st.id" class="p-3" style="border-bottom:1px solid #f2f2f2">
              <div class="is-flex is-justify-content-space-between is-align-items-start is-flex-wrap-wrap" style="gap:.5rem">
                <div>
                  <p class="has-text-weight-semibold">{{ st.name }}
                    <span class="tag is-light is-small">{{ $t('roles.' + (st.role || 'technician')) }}</span>
                    <span v-if="st.cpfm" class="tag is-warning is-light is-small">CPFM</span>
                    <span v-if="st.active === false" class="tag is-dark is-light is-small">{{ $t('users.inactive') }}</span>
                  </p>
                  <p class="is-size-7 has-text-grey"><template v-if="st.code">{{ $t('users.staffCode') }} {{ st.code }} · </template>{{ st.company }}</p>
                </div>
                <div v-if="st.uid" class="is-size-7 has-text-right">
                  <span class="tag is-success is-light"><i class="mdi mdi-link-variant mr-1"></i>{{ userById[st.uid]?.displayName || userById[st.uid]?.email || st.uid }}</span>
                  <a class="ml-2" @click="unlinkStaff(st)">{{ $t('users.unlink') }}</a>
                </div>
                <span v-else class="tag is-light">{{ $t('users.noAccount') }}</span>
              </div>
              <div v-if="!st.uid" class="columns is-mobile is-multiline mt-1 mb-0">
                <form class="column is-12-mobile is-6-tablet" @submit.prevent="saveStaffEmail(st)">
                  <div class="field has-addons mb-0">
                    <div class="control is-expanded"><input class="input is-small" type="email" :value="mail[st.id] ?? st.email ?? ''" @input="mail[st.id] = $event.target.value" :placeholder="$t('users.linkEmail')" /></div>
                    <div class="control"><button class="button is-small is-primary" :disabled="mail[st.id] === undefined">{{ $t('common.save') }}</button></div>
                  </div>
                  <p v-if="st.email" class="help">{{ $t('users.waitingFor', { email: st.email }) }}</p>
                </form>
                <div class="column is-12-mobile is-6-tablet">
                  <div class="field has-addons mb-0">
                    <div class="control is-expanded"><div class="select is-small is-fullwidth"><select v-model="pick[st.id]">
                      <option :value="undefined">{{ $t('users.linkAccount') }}…</option>
                      <option v-for="u in unlinkedUsers" :key="u.id" :value="u.id">{{ u.displayName || '-' }} · {{ u.email }}</option>
                    </select></div></div>
                    <div class="control"><button class="button is-small" :disabled="!pick[st.id]" @click="linkStaff(st, pick[st.id])"><i class="mdi mdi-link-variant"></i></button></div>
                    <div class="control" v-if="!st.cpfm"><button class="button is-small is-danger is-light" :title="$t('common.delete')" @click="removeStaff(st)"><i class="mdi mdi-delete"></i></button></div>
                  </div>
                </div>
              </div>
            </div>
            <p v-if="!staffShown.length" class="p-3 has-text-grey">{{ $t('common.noData') }}</p>
          </div>
        </div>
        <div class="column is-4">
          <form class="box action-box" @submit.prevent="addStaff">
            <h2 class="title is-6 mb-1">{{ $t('users.addStaff') }}</h2>
            <p class="is-size-7 has-text-grey mb-3">{{ $t('users.addStaffHint') }}</p>
            <div class="field"><input class="input is-small" v-model="add.name" :placeholder="$t('auth.displayName')" required maxlength="120" /></div>
            <div class="field"><div class="select is-small is-fullwidth"><select v-model="add.role">
              <option value="technician">{{ $t('roles.technician') }}</option><option value="contractor">{{ $t('roles.contractor') }}</option></select></div></div>
            <div class="field"><input class="input is-small" v-model="add.company" :placeholder="$t('profile.company')" maxlength="120" /></div>
            <div class="field"><input class="input is-small" type="email" v-model="add.email" :placeholder="$t('users.linkEmail')" /></div>
            <button class="button is-primary is-small is-fullwidth">{{ $t('common.add') }}</button>
          </form>
        </div>
      </div>
    </div>
  </section>
</template>
