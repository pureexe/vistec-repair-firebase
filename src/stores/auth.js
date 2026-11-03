import { reactive, computed } from 'vue'
import { onAuthStateChanged } from 'firebase/auth'
import { ref as dbRef, onValue, get, update, serverTimestamp, query, orderByChild, equalTo } from 'firebase/database'
import { auth, db } from '../firebase.js'
import { emailKey, toArray, STAFF_ROLES } from '../services/util.js'
import { setLocale } from '../i18n/index.js'

export const authState = reactive({ ready: false, user: null, profile: null })

export const role = computed(() => authState.profile?.role || (authState.user ? 'user' : null))
export const isStaff = computed(() => STAFF_ROLES.includes(role.value))
export const isTech = computed(() => ['technician', 'admin'].includes(role.value))
export const isAdmin = computed(() => role.value === 'admin')
/** Keys this person can appear under in jobs/{id}/assignees: their uid and their linked /staff record */
export const assigneeKeys = computed(() => [authState.user?.uid, authState.profile?.staffId].filter(Boolean))

let unsubProfile = null
let readyResolve
export const authReady = new Promise((r) => (readyResolve = r))

async function ensureProfile(u) {
  const pref = dbRef(db, `users/${u.uid}`)
  const snap = await get(pref)
  const providers = Object.fromEntries(u.providerData.map((p) => [p.providerId.replace(/\./g, '_'), true]))
  const base = { email: (u.email || '').toLowerCase(), providers, lastLoginAt: serverTimestamp() }
  if (!snap.exists()) {
    let lang = 'th'
    try { lang = localStorage.getItem('lang') || 'th' } catch {}
    await update(pref, { ...base, displayName: u.displayName || '', phone: '', department: '', lang, role: 'user', createdAt: serverTimestamp() })
  } else {
    await update(pref, base)
  }
  // Invite → upgrade role (only works when the e-mail is verified, enforced by rules)
  if (u.email) {
    try {
      const inv = await get(dbRef(db, `invites/${emailKey(u.email)}`))
      const cur = (await get(dbRef(db, `users/${u.uid}/role`))).val()
      if (inv.exists() && cur === 'user') {
        const i = inv.val()
        const patch = { role: i.role }
        if (i.company) patch.company = i.company
        if (i.name && !u.displayName) patch.displayName = i.name
        await update(pref, patch)
      }
    } catch (e) { /* no invite / not verified */ }
  }
  // A /staff record the admin left for this e-mail (e.g. a CPFM technician) → link it, so the jobs it was
  // assigned become this person's. Rules check the verified e-mail.
  if (u.email && u.emailVerified) {
    try {
      if (!(await get(dbRef(db, `users/${u.uid}/staffId`))).exists()) {
        const s = await get(query(dbRef(db, 'staff'), orderByChild('email'), equalTo(u.email.toLowerCase())))
        const hit = toArray(s.val()).find((x) => !x.uid)
        if (hit) await update(dbRef(db), { [`staff/${hit.id}/uid`]: u.uid, [`users/${u.uid}/staffId`]: hit.id })
      }
    } catch (e) { console.warn('staff link', e) }
  }
}

onAuthStateChanged(auth, async (u) => {
  if (unsubProfile) { unsubProfile(); unsubProfile = null }
  authState.user = u
  authState.profile = null
  if (u) {
    try { await ensureProfile(u) } catch (e) { console.warn('profile', e) }
    await new Promise((resolve) => {
      unsubProfile = onValue(dbRef(db, `users/${u.uid}`), (s) => {
        authState.profile = s.val()
        if (authState.profile?.lang && !authState.ready) setLocale(authState.profile.lang)
        resolve()
      }, () => resolve())
    })
  }
  authState.ready = true
  readyResolve()
})
